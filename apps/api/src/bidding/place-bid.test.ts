import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auctions, bids, notifications } from "../db/schema.js";
import { insertAuction, insertGem, insertUser, makeTestDb, type AnyDb } from "../test/harness.js";
import { placeBid } from "./place-bid.js";

describe("placeBid (single-connection rules, PGlite)", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let sellerId: string;
  let gemId: string;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    const seller = await insertUser(db, { name: "Seller" });
    sellerId = seller.id;
    const gem = await insertGem(db, sellerId);
    gemId = gem.id;
  });

  afterEach(async () => {
    await close();
  });

  it("rejects a bid below the start-price floor (no bids yet)", async () => {
    const auction = await insertAuction(db, gemId, { startPrice: 1000, minIncrement: 100 });
    const bidder = await insertUser(db);
    const res = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 999 });
    expect(res).toEqual({ ok: false, reason: "BID_TOO_LOW" });
  });

  it("accepts a bid exactly at the start-price floor", async () => {
    const auction = await insertAuction(db, gemId, { startPrice: 1000, minIncrement: 100 });
    const bidder = await insertUser(db);
    const res = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 1000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bid.amount).toBe(1000);
      expect(res.auction.highestBid).toBe(1000);
      expect(res.auction.highestBidderId).toBe(bidder.id);
    }
  });

  it("rejects below highest_bid + min_increment; accepts exactly at it", async () => {
    const auction = await insertAuction(db, gemId, { startPrice: 1000, minIncrement: 100 });
    const first = await insertUser(db);
    const second = await insertUser(db);

    const r1 = await placeBid(db, { auctionId: auction.id, bidderId: first.id, amount: 1000 });
    expect(r1.ok).toBe(true);

    // Floor is now 1000 + 100 = 1100.
    const tooLow = await placeBid(db, {
      auctionId: auction.id,
      bidderId: second.id,
      amount: 1099,
    });
    expect(tooLow).toEqual({ ok: false, reason: "BID_TOO_LOW" });

    const atFloor = await placeBid(db, {
      auctionId: auction.id,
      bidderId: second.id,
      amount: 1100,
    });
    expect(atFloor.ok).toBe(true);
    if (atFloor.ok) expect(atFloor.auction.highestBid).toBe(1100);
  });

  it("rejects a bid before start_at", async () => {
    const now = Date.now();
    const auction = await insertAuction(db, gemId, {
      startAt: new Date(now + 3_600_000),
      endAt: new Date(now + 7_200_000),
      status: "active",
    });
    const bidder = await insertUser(db);
    const res = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 5000 });
    expect(res).toEqual({ ok: false, reason: "AUCTION_NOT_STARTED" });
  });

  it("rejects a bid after end_at", async () => {
    const now = Date.now();
    const auction = await insertAuction(db, gemId, {
      startAt: new Date(now - 7_200_000),
      endAt: new Date(now - 3_600_000),
      status: "active",
    });
    const bidder = await insertUser(db);
    const res = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 5000 });
    expect(res).toEqual({ ok: false, reason: "AUCTION_ENDED" });
  });

  it("rejects a bid when the auction is not active", async () => {
    const auction = await insertAuction(db, gemId, { status: "scheduled" });
    const bidder = await insertUser(db);
    const res = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 5000 });
    expect(res).toEqual({ ok: false, reason: "AUCTION_NOT_ACTIVE" });
  });

  it("rejects a self-bid by the gem's seller", async () => {
    const auction = await insertAuction(db, gemId, { startPrice: 1000 });
    const res = await placeBid(db, { auctionId: auction.id, bidderId: sellerId, amount: 5000 });
    expect(res).toEqual({ ok: false, reason: "SELF_BID_FORBIDDEN" });
  });

  it("rejects a bid from the account already holding highest_bidder_id", async () => {
    const auction = await insertAuction(db, gemId, { startPrice: 1000, minIncrement: 100 });
    const bidder = await insertUser(db);

    const r1 = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 1000 });
    expect(r1.ok).toBe(true);

    // Same bidder tries to raise their own bid — already winning.
    const r2 = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 1100 });
    expect(r2).toEqual({ ok: false, reason: "ALREADY_HIGHEST_BIDDER" });
  });

  it("returns AUCTION_NOT_FOUND for an unknown auction id", async () => {
    const bidder = await insertUser(db);
    const res = await placeBid(db, {
      auctionId: "00000000-0000-0000-0000-000000000000",
      bidderId: bidder.id,
      amount: 5000,
    });
    expect(res).toEqual({ ok: false, reason: "AUCTION_NOT_FOUND" });
  });

  it("updates highest_bid and highest_bidder_id atomically on success", async () => {
    const auction = await insertAuction(db, gemId, { startPrice: 1000, minIncrement: 100 });
    const bidder = await insertUser(db);

    const res = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 2500 });
    expect(res.ok).toBe(true);

    const [persisted] = await db.select().from(auctions).where(eq(auctions.id, auction.id));
    expect(persisted?.highestBid).toBe(2500);
    expect(persisted?.highestBidderId).toBe(bidder.id);

    const rows = await db.select().from(bids).where(eq(bids.auctionId, auction.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(2500);
  });

  it("inserts an OUTBID notification for the displaced highest bidder", async () => {
    const auction = await insertAuction(db, gemId, { startPrice: 1000, minIncrement: 100 });
    const first = await insertUser(db);
    const second = await insertUser(db);

    const r1 = await placeBid(db, { auctionId: auction.id, bidderId: first.id, amount: 1000 });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.outbidUserId).toBeNull(); // no previous leader

    const r2 = await placeBid(db, { auctionId: auction.id, bidderId: second.id, amount: 1100 });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.outbidUserId).toBe(first.id);

    const rows = await db
      .select({ type: notifications.type })
      .from(notifications)
      .where(eq(notifications.userId, first.id));
    expect(rows.map((n) => n.type)).toEqual(["OUTBID"]);
  });

  describe("anti-snipe", () => {
    it("extends end_at when a winning bid lands inside the window", async () => {
      const now = Date.now();
      const endAt = new Date(now + 10_000); // 10s left, window is 30s -> inside
      const auction = await insertAuction(db, gemId, {
        startPrice: 1000,
        endAt,
        antiSnipeWindowSeconds: 30,
        antiSnipeExtendSeconds: 60,
      });
      const bidder = await insertUser(db);

      const res = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 1000 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        // Extended by ~60s from the original end.
        const delta = res.auction.endAt.getTime() - endAt.getTime();
        expect(delta).toBe(60_000);
      }
    });

    it("does not extend end_at when the bid is outside the window", async () => {
      const now = Date.now();
      const endAt = new Date(now + 3_600_000); // 1h left, window 30s -> outside
      const auction = await insertAuction(db, gemId, {
        startPrice: 1000,
        endAt,
        antiSnipeWindowSeconds: 30,
        antiSnipeExtendSeconds: 60,
      });
      const bidder = await insertUser(db);

      const res = await placeBid(db, { auctionId: auction.id, bidderId: bidder.id, amount: 1000 });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.auction.endAt.getTime()).toBe(endAt.getTime());
    });
  });
});
