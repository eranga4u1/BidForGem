import "reflect-metadata";
import { eq } from "drizzle-orm";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuctionExtendedEvent, BidPlacedEvent } from "@gem/types";
import { auctions, bids } from "../db/schema.js";
import { insertAuction, insertGem, type AuctionOverrides } from "../test/harness.js";
import { makeTestApi, type TestApi } from "../test/nest-app.js";

let api: TestApi;
let seq = 0;
const uniqueEmail = (): string => `u${++seq}-${Date.now()}@test.dev`;

beforeAll(async () => {
  api = await makeTestApi();
});
afterAll(async () => {
  await api.close();
});

const http = () => request(api.app.getHttpServer());

interface Registered {
  token: string;
  id: string;
  name: string;
  email: string;
}

async function register(): Promise<Registered> {
  const email = uniqueEmail();
  const res = await http()
    .post("/auth/register")
    .send({ name: "Bidder", email, password: "Sapphire!Blue-42xz" });
  expect(res.status).toBe(201);
  const body = res.body as { tokens: { accessToken: string }; user: { id: string; name: string } };
  return { token: body.tokens.accessToken, id: body.user.id, name: body.user.name, email };
}

function bid(auctionId: string, token: string | null, amount: number) {
  const req = http().post(`/auctions/${auctionId}/bids`).send({ amount });
  return token ? req.set("authorization", `Bearer ${token}`) : req;
}

async function sellerWithAuction(
  overrides: AuctionOverrides = {},
): Promise<{ seller: Registered; auctionId: string }> {
  const seller = await register();
  const gem = await insertGem(api.db, seller.id, { status: "active" });
  const auction = await insertAuction(api.db, gem.id, {
    startPrice: 1000,
    minIncrement: 100,
    status: "active",
    ...overrides,
  });
  return { seller, auctionId: auction.id };
}

// --- socket helpers ---
function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${api.url}/auctions`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}
function waitFor<T>(socket: Socket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
function expectNoEvent(socket: Socket, event: string, windowMs = 800): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (): void => reject(new Error(`unexpected ${event}`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, windowMs);
  });
}

describe("API e2e (HTTP + Socket.IO)", () => {
  it("GET /health reports ok", async () => {
    const res = await http().get("/health");
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("ok");
  });

  it("rejects an unauthenticated bid with 401 before reaching placeBid", async () => {
    const { auctionId } = await sellerWithAuction();
    const res = await bid(auctionId, null, 1000);
    expect(res.status).toBe(401);
    expect(await api.db.$count(bids, eq(bids.auctionId, auctionId))).toBe(0);
  });

  it("persists a successful HTTP bid and updates the high-water mark", async () => {
    const { auctionId } = await sellerWithAuction();
    const bidder = await register();
    const res = await bid(auctionId, bidder.token, 1500);
    expect(res.status).toBe(201);

    const rows = await api.db.select().from(bids).where(eq(bids.auctionId, auctionId));
    expect(rows).toHaveLength(1);
    const [a] = await api.db.select().from(auctions).where(eq(auctions.id, auctionId));
    expect(a?.highestBid).toBe(1500);
    expect(a?.highestBidderId).toBe(bidder.id);
  });

  describe("PlaceBidRejection -> HTTP status mapping", () => {
    it("AUCTION_NOT_FOUND -> 404", async () => {
      const bidder = await register();
      const res = await bid("00000000-0000-0000-0000-000000000000", bidder.token, 1000);
      expect(res.status).toBe(404);
    });
    it("BID_TOO_LOW -> 409", async () => {
      const { auctionId } = await sellerWithAuction();
      const bidder = await register();
      const res = await bid(auctionId, bidder.token, 500);
      expect(res.status).toBe(409);
      expect((res.body as { error: { code: string } }).error.code).toBe("BID_TOO_LOW");
    });
    it("AUCTION_NOT_ACTIVE -> 409", async () => {
      const { auctionId } = await sellerWithAuction({ status: "scheduled" });
      const bidder = await register();
      expect((await bid(auctionId, bidder.token, 1000)).status).toBe(409);
    });
    it("AUCTION_NOT_STARTED -> 409", async () => {
      const now = Date.now();
      const { auctionId } = await sellerWithAuction({
        status: "active",
        startAt: new Date(now + 3_600_000),
        endAt: new Date(now + 7_200_000),
      });
      const bidder = await register();
      expect((await bid(auctionId, bidder.token, 1000)).status).toBe(409);
    });
    it("AUCTION_ENDED -> 409", async () => {
      const now = Date.now();
      const { auctionId } = await sellerWithAuction({
        status: "active",
        startAt: new Date(now - 7_200_000),
        endAt: new Date(now - 3_600_000),
      });
      const bidder = await register();
      expect((await bid(auctionId, bidder.token, 1000)).status).toBe(409);
    });
    it("SELF_BID_FORBIDDEN -> 403", async () => {
      const { seller, auctionId } = await sellerWithAuction();
      expect((await bid(auctionId, seller.token, 1000)).status).toBe(403);
    });
    it("ALREADY_HIGHEST_BIDDER -> 403", async () => {
      const { auctionId } = await sellerWithAuction();
      const bidder = await register();
      expect((await bid(auctionId, bidder.token, 1000)).status).toBe(201);
      expect((await bid(auctionId, bidder.token, 1100)).status).toBe(403);
    });
  });

  it("POST /auctions creates an auction and cancel succeeds with zero bids", async () => {
    const seller = await register();
    const gem = await insertGem(api.db, seller.id, { status: "active" });
    const createRes = await http()
      .post("/auctions")
      .set("authorization", `Bearer ${seller.token}`)
      .send({
        gemId: gem.id,
        startPrice: 1000,
        minIncrement: 100,
        currency: "USD",
        durationSeconds: 3600,
      });
    expect(createRes.status).toBe(201);
    const auctionId = (createRes.body as { auction: { id: string } }).auction.id;
    const cancelRes = await http()
      .post(`/auctions/${auctionId}/cancel`)
      .set("authorization", `Bearer ${seller.token}`);
    expect(cancelRes.status).toBe(201);
  });

  it("GET /auctions/:id/bids is paginated, newest first", async () => {
    const { auctionId } = await sellerWithAuction();
    for (const amount of [1000, 1100, 1200]) {
      const bidder = await register();
      expect((await bid(auctionId, bidder.token, amount)).status).toBe(201);
    }
    const res = await http().get(`/auctions/${auctionId}/bids`).query({ limit: 2 });
    expect(res.status).toBe(200);
    const items = (res.body as { items: { amount: number }[] }).items;
    expect(items.map((i) => i.amount)).toEqual([1200, 1100]);
  });

  it("emits bid:placed to the auction's room and NOT to another auction's room", async () => {
    const a = await sellerWithAuction();
    const b = await sellerWithAuction();
    const clientA = await connect();
    const clientB = await connect();
    await clientA.emitWithAck("join", { auctionId: a.auctionId });
    await clientB.emitWithAck("join", { auctionId: b.auctionId });

    const bidder = await register();
    const received = waitFor<BidPlacedEvent>(clientA, "bid:placed");
    const silent = expectNoEvent(clientB, "bid:placed");

    expect((await bid(a.auctionId, bidder.token, 1000)).status).toBe(201);

    const payload = await received;
    expect(payload.auctionId).toBe(a.auctionId);
    expect(payload.amount).toBe(1000);
    expect(payload.bidderDisplayName).toBe(bidder.name);
    await silent;

    clientA.disconnect();
    clientB.disconnect();
  });

  it("emits nothing when a bid is rejected", async () => {
    const { auctionId } = await sellerWithAuction();
    const client = await connect();
    await client.emitWithAck("join", { auctionId });
    const bidder = await register();
    const silent = expectNoEvent(client, "bid:placed");
    expect((await bid(auctionId, bidder.token, 100)).status).toBe(409);
    await silent;
    client.disconnect();
  });

  it("bid:placed payload contains no email, user id, or other PII", async () => {
    const { auctionId } = await sellerWithAuction();
    const client = await connect();
    await client.emitWithAck("join", { auctionId });
    const bidder = await register();
    const received = waitFor<Record<string, unknown>>(client, "bid:placed");
    expect((await bid(auctionId, bidder.token, 1000)).status).toBe(201);

    const payload = await received;
    expect(Object.keys(payload).sort()).toEqual([
      "amount",
      "auctionId",
      "bidCount",
      "bidderDisplayName",
      "endAt",
      "highestBid",
    ]);
    const json = JSON.stringify(payload);
    expect(json).not.toContain(bidder.id);
    expect(json).not.toContain(bidder.email);
    client.disconnect();
  });

  it("anti-snipe: a bid inside the window emits auction:extended with the new end_at", async () => {
    const now = Date.now();
    const originalEnd = new Date(now + 10_000);
    const { auctionId } = await sellerWithAuction({
      status: "active",
      startAt: new Date(now - 60_000),
      endAt: originalEnd,
      antiSnipeWindowSeconds: 30,
      antiSnipeExtendSeconds: 60,
    });
    const client = await connect();
    await client.emitWithAck("join", { auctionId });
    const bidder = await register();
    const extended = waitFor<AuctionExtendedEvent>(client, "auction:extended");

    expect((await bid(auctionId, bidder.token, 1000)).status).toBe(201);

    const payload = await extended;
    expect(payload.auctionId).toBe(auctionId);
    expect(new Date(payload.endAt).getTime()).toBe(originalEnd.getTime() + 60_000);
    client.disconnect();
  });
});
