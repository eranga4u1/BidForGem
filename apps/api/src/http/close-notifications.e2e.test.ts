import "reflect-metadata";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuctionClosedEvent, UserNotificationEvent } from "@gem/types";
import { bids } from "../db/schema.js";
import { insertAuction, insertGem } from "../test/harness.js";
import { makeTestApi, type TestApi } from "../test/nest-app.js";
import { AuctionCloserService } from "./auctions/auction-closer.service.js";

let api: TestApi;
let closer: AuctionCloserService;
let seq = 0;
const uniqueEmail = (): string => `n${++seq}-${Date.now()}@test.dev`;

beforeAll(async () => {
  api = await makeTestApi();
  closer = api.app.get(AuctionCloserService);
});
afterAll(async () => {
  await api.close();
});

const http = () => request(api.app.getHttpServer());

interface Registered {
  token: string;
  id: string;
}
async function register(): Promise<Registered> {
  const res = await http()
    .post("/auth/register")
    .send({ name: "User", email: uniqueEmail(), password: "Sapphire!Blue-42xz" });
  expect(res.status).toBe(201);
  const body = res.body as { tokens: { accessToken: string }; user: { id: string } };
  return { token: body.tokens.accessToken, id: body.user.id };
}

async function endedAuctionWonBy(
  winnerId: string,
): Promise<{ seller: Registered; auctionId: string }> {
  const seller = await register();
  const gem = await insertGem(api.db, seller.id, { status: "active" });
  const now = Date.now();
  const auction = await insertAuction(api.db, gem.id, {
    status: "active",
    startAt: new Date(now - 7_200_000),
    endAt: new Date(now - 3_600_000),
    startPrice: 1000,
    minIncrement: 100,
    highestBid: 1500,
    highestBidderId: winnerId,
  });
  await api.db.insert(bids).values({ auctionId: auction.id, bidderId: winnerId, amount: 1500 });
  return { seller, auctionId: auction.id };
}

function connect(token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${api.url}/auctions`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      auth: token ? { token } : {},
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
const settle = (ms = 400): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("close + notifications e2e", () => {
  it("emits auction:closed to the room only, and AUCTION_WON to the winner only", async () => {
    const winner = await register();
    const other = await register();
    const target = await endedAuctionWonBy(winner.id);
    const decoy = await endedAuctionWonBy(other.id); // NOT closed in this test

    const roomClient = await connect();
    await roomClient.emitWithAck("join", { auctionId: target.auctionId });
    const decoyRoomClient = await connect();
    await decoyRoomClient.emitWithAck("join", { auctionId: decoy.auctionId });

    const winnerSocket = await connect(winner.token);
    const otherSocket = await connect(other.token);
    await settle(); // let the handshake user-room joins complete

    const closedInRoom = waitFor<AuctionClosedEvent>(roomClient, "auction:closed");
    const noClosedInDecoy = expectNoEvent(decoyRoomClient, "auction:closed");
    const wonByWinner = waitFor<UserNotificationEvent>(winnerSocket, "notification");
    const otherGetsNothing = expectNoEvent(otherSocket, "notification");

    const res = await closer.close(target.auctionId);
    expect(res.ok).toBe(true);

    const closed = await closedInRoom;
    expect(closed.auctionId).toBe(target.auctionId);
    expect(closed.winnerId).toBe(winner.id);

    const won = await wonByWinner;
    expect(won.type).toBe("AUCTION_WON");

    await noClosedInDecoy;
    await otherGetsNothing;

    roomClient.disconnect();
    decoyRoomClient.disconnect();
    winnerSocket.disconnect();
    otherSocket.disconnect();
  });

  it("notification endpoints return only the caller's own rows", async () => {
    const winner = await register();
    const { seller, auctionId } = await endedAuctionWonBy(winner.id);
    await closer.close(auctionId);

    const winRes = await http()
      .get("/notifications")
      .set("authorization", `Bearer ${winner.token}`);
    expect(winRes.status).toBe(200);
    const winItems = (winRes.body as { items: { id: string; type: string }[] }).items;
    expect(winItems.map((i) => i.type)).toContain("AUCTION_WON");

    const sellerRes = await http()
      .get("/notifications")
      .set("authorization", `Bearer ${seller.token}`);
    const sellerItems = (sellerRes.body as { items: { id: string; type: string }[] }).items;
    expect(sellerItems.map((i) => i.type)).toEqual(["AUCTION_SOLD"]);

    // The seller cannot mark the winner's notification read.
    const winNotifId = winItems.find((i) => i.type === "AUCTION_WON")!.id;
    const forbiddenRead = await http()
      .post(`/notifications/${winNotifId}/read`)
      .set("authorization", `Bearer ${seller.token}`);
    expect(forbiddenRead.status).toBe(404);

    // The winner can mark their own read, then mark-all.
    expect(
      (
        await http()
          .post(`/notifications/${winNotifId}/read`)
          .set("authorization", `Bearer ${winner.token}`)
      ).status,
    ).toBe(200);
    expect(
      (await http().post("/notifications/read-all").set("authorization", `Bearer ${winner.token}`))
        .status,
    ).toBe(200);
  });
});
