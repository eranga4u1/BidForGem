import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bids } from "../db/schema.js";
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
    startAt: new Date(Date.now() - 60_000).toISOString(),
    endAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

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

    it("rejects an invalid time window (end <= start)", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const now = Date.now();
      expect(
        await service.create(sellerId, {
          ...baseInput(gem.id),
          startAt: new Date(now + 7_200_000).toISOString(),
          endAt: new Date(now + 3_600_000).toISOString(),
        }),
      ).toEqual({ ok: false, reason: "INVALID_TIME_WINDOW" });
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
});
