import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUCTION_MAX_DURATION_SECONDS } from "@gem/types";
import { placeBid } from "../bidding/place-bid.js";
import { bids, users } from "../db/schema.js";
import { insertAuction, insertGem, insertUser, makeTestDb, type AnyDb } from "../test/harness.js";
import { createAuctionsService, type AuctionsService } from "./auctions-service.js";

describe("AuctionsService", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let service: AuctionsService;
  let sellerId: string;
  let otherId: string;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    service = createAuctionsService({ db });
    sellerId = (await insertUser(db, { name: "Seller" })).id;
    otherId = (await insertUser(db, { name: "Other" })).id;
  });

  afterEach(async () => {
    await close();
  });

  const baseInput = (gemId: string): Record<string, unknown> => ({
    gemId,
    startPrice: 1000,
    minIncrement: 100,
    currency: "USD",
    durationSeconds: 3600,
  });

  /** The DB clock — the oracle the deadline assertions compare against. */
  const dbNow = async (): Promise<Date> => {
    const [row] = await db
      .select({ now: sql<Date>`now()` })
      .from(users)
      .limit(1);
    return new Date(row!.now);
  };

  describe("create", () => {
    it("creates an active auction for an owned, published gem", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const res = await service.create(sellerId, baseInput(gem.id));
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.auction.status).toBe("active");
        expect(res.auction.startPrice).toBe(1000);
        expect(res.auction.bidCount).toBe(0);
      }
    });

    it("rejects a non-owner", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      expect(await service.create(otherId, baseInput(gem.id))).toEqual({
        ok: false,
        reason: "NOT_GEM_OWNER",
      });
    });

    it("rejects a draft (unpublished) gem", async () => {
      const gem = await insertGem(db, sellerId, { status: "draft" });
      expect(await service.create(sellerId, baseInput(gem.id))).toEqual({
        ok: false,
        reason: "GEM_NOT_ACTIVE",
      });
    });

    it("rejects a second auction while one is already live", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      expect((await service.create(sellerId, baseInput(gem.id))).ok).toBe(true);
      expect(await service.create(sellerId, baseInput(gem.id))).toEqual({
        ok: false,
        reason: "AUCTION_ALREADY_EXISTS",
      });
    });

    it("rejects a reserve price below the start price", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      expect(await service.create(sellerId, { ...baseInput(gem.id), reservePrice: 500 })).toEqual({
        ok: false,
        reason: "RESERVE_BELOW_START",
      });
    });

    it("computes start_at and end_at from the DB clock (end = start + duration)", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const before = await dbNow();
      const res = await service.create(sellerId, { ...baseInput(gem.id), durationSeconds: 3600 });
      const after = await dbNow();
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // start_at sits between two DB-clock reads — the server clock, not Node's.
      expect(res.auction.startAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(res.auction.startAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(res.auction.endAt.getTime() - res.auction.startAt.getTime()).toBe(3_600_000);
    });

    it("ignores a client-supplied end_at — the server value always wins", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const bogusEnd = new Date(Date.now() + 999 * 86_400_000).toISOString(); // ~2.7 years out
      const res = await service.create(sellerId, {
        ...baseInput(gem.id),
        durationSeconds: 3600,
        endAt: bogusEnd, // smuggled: not part of the schema, must not take effect
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.auction.endAt.getTime() - res.auction.startAt.getTime()).toBe(3_600_000);
      expect(res.auction.endAt.getTime()).toBeLessThan(new Date(bogusEnd).getTime());
    });

    it("rejects a duration below the minimum", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const res = await service.create(sellerId, { ...baseInput(gem.id), durationSeconds: 59 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("INVALID_INPUT");
    });

    it("rejects a duration above the maximum", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const res = await service.create(sellerId, {
        ...baseInput(gem.id),
        durationSeconds: AUCTION_MAX_DURATION_SECONDS + 1,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("INVALID_INPUT");
    });

    it("rejects a start_at in the past", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const res = await service.create(sellerId, {
        ...baseInput(gem.id),
        startAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(res).toEqual({ ok: false, reason: "START_IN_PAST" });
    });

    it("schedules an auction when start_at is a valid future instant", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const future = new Date(Date.now() + 3_600_000);
      const res = await service.create(sellerId, {
        ...baseInput(gem.id),
        durationSeconds: 3600,
        startAt: future.toISOString(),
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.auction.status).toBe("scheduled");
      expect(res.auction.startAt.getTime()).toBe(future.getTime());
      expect(res.auction.endAt.getTime() - res.auction.startAt.getTime()).toBe(3_600_000);
    });

    it("anti-snipe composes with the server-computed deadline", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      // window (120s) > duration (60s), so a bid placed now already lands inside it.
      const created = await service.create(sellerId, {
        ...baseInput(gem.id),
        durationSeconds: 60,
        antiSnipeWindowSeconds: 120,
        antiSnipeExtendSeconds: 60,
      });
      if (!created.ok) throw new Error("setup failed");
      const bidder = await insertUser(db, { name: "Bidder" });
      const res = await placeBid(db, {
        auctionId: created.auction.id,
        bidderId: bidder.id,
        amount: 1000,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // The server-computed end_at was extended by exactly the extend window.
      expect(res.auction.endAt.getTime()).toBe(created.auction.endAt.getTime() + 60_000);
    });

    it("rejects a non-integer money amount at the boundary", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const res = await service.create(sellerId, { ...baseInput(gem.id), startPrice: 10.5 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("INVALID_INPUT");
    });
  });

  describe("cancel", () => {
    it("cancels an auction with zero bids", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const created = await service.create(sellerId, baseInput(gem.id));
      if (!created.ok) throw new Error("setup failed");
      const res = await service.cancel(sellerId, created.auction.id);
      expect(res.ok && res.auction.status).toBe("canceled");
    });

    it("rejects cancel once a bid exists", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const auction = await insertAuction(db, gem.id, { status: "active" });
      const bidder = await insertUser(db);
      await db.insert(bids).values({ auctionId: auction.id, bidderId: bidder.id, amount: 1000 });
      expect(await service.cancel(sellerId, auction.id)).toEqual({
        ok: false,
        reason: "AUCTION_HAS_BIDS",
      });
    });

    it("rejects cancel by a non-owner", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const auction = await insertAuction(db, gem.id, { status: "active" });
      expect(await service.cancel(otherId, auction.id)).toEqual({ ok: false, reason: "FORBIDDEN" });
    });
  });

  describe("bidHistory", () => {
    it("is paginated and ordered newest first", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const auction = await insertAuction(db, gem.id, { status: "active" });
      const base = Date.now();
      for (let i = 0; i < 3; i++) {
        const bidder = await insertUser(db, { name: `Bidder ${i}` });
        await db.insert(bids).values({
          auctionId: auction.id,
          bidderId: bidder.id,
          amount: 1000 + i * 100,
          createdAt: new Date(base + i * 1000),
        });
      }
      const page = await service.bidHistory(auction.id, { limit: 2, offset: 0 });
      expect(page.ok).toBe(true);
      if (page.ok) {
        expect(page.items).toHaveLength(2);
        // Newest first: amounts 1200 then 1100.
        expect(page.items.map((b) => b.amount)).toEqual([1200, 1100]);
        expect(page.items[0]?.bidderDisplayName).toBe("Bidder 2");
      }
    });

    it("returns NOT_FOUND for an unknown auction", async () => {
      expect(await service.bidHistory("00000000-0000-0000-0000-000000000000", {})).toEqual({
        ok: false,
        reason: "NOT_FOUND",
      });
    });
  });

  describe("list", () => {
    it("filters by gemId, returning only that gem's auctions", async () => {
      const gemA = await insertGem(db, sellerId, { status: "active" });
      const gemB = await insertGem(db, sellerId, { status: "active" });
      const aAuction = await insertAuction(db, gemA.id, { status: "active" });
      await insertAuction(db, gemB.id, { status: "active" });

      const res = await service.list({ gemId: gemA.id });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.id).toBe(aAuction.id);
      expect(res.items[0]?.gemId).toBe(gemA.id);
    });

    it("gemId + status returns the live auction and excludes a terminal one", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      await insertAuction(db, gem.id, { status: "closed" });
      const live = await insertAuction(db, gem.id, { status: "active" });

      // Both auctions belong to the gem...
      const all = await service.list({ gemId: gem.id });
      expect(all.ok && all.items).toHaveLength(2);
      // ...but the live filter isolates the non-terminal one.
      const res = await service.list({ gemId: gem.id, status: "active" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.items.map((a) => a.id)).toEqual([live.id]);
    });

    it("returns an empty list when the gem has no auction", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const res = await service.list({ gemId: gem.id });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.items).toEqual([]);
    });
  });
});
