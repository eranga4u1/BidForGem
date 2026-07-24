import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auctions, bids, gems, notifications } from "../db/schema.js";
import { insertAuction, insertGem, insertUser, makeTestDb, type AnyDb } from "../test/harness.js";
import { closeAuction } from "./close-auction.js";

describe("closeAuction", () => {
  let db: AnyDb;
  let close: () => Promise<void>;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
  });
  afterEach(async () => {
    await close();
  });

  async function endedAuction(opts: {
    reservePrice?: number | null;
    bids?: { bidderId: string; amount: number }[];
  }): Promise<{ sellerId: string; gemId: string; auctionId: string }> {
    const seller = await insertUser(db, { name: "Seller" });
    const gem = await insertGem(db, seller.id, { status: "active" });
    const now = Date.now();
    const list = opts.bids ?? [];
    const top = list.reduce<{ bidderId: string; amount: number } | null>(
      (m, b) => (!m || b.amount > m.amount ? b : m),
      null,
    );
    const auction = await insertAuction(db, gem.id, {
      status: "active",
      startAt: new Date(now - 7_200_000),
      endAt: new Date(now - 3_600_000),
      startPrice: 1000,
      minIncrement: 100,
      reservePrice: opts.reservePrice ?? null,
      highestBid: top?.amount ?? null,
      highestBidderId: top?.bidderId ?? null,
    });
    for (const b of list) {
      await db
        .insert(bids)
        .values({ auctionId: auction.id, bidderId: b.bidderId, amount: b.amount });
    }
    return { sellerId: seller.id, gemId: gem.id, auctionId: auction.id };
  }

  const notifsFor = (userId: string): Promise<{ type: string }[]> =>
    db
      .select({ type: notifications.type })
      .from(notifications)
      .where(eq(notifications.userId, userId));

  it("no bids -> closed, no winner, gem back to active, seller notified", async () => {
    const { sellerId, gemId, auctionId } = await endedAuction({});
    const res = await closeAuction(db, auctionId);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.outcome).toBe("closed");
      expect(res.winnerId).toBeNull();
    }
    const [a] = await db.select().from(auctions).where(eq(auctions.id, auctionId));
    expect(a?.status).toBe("closed");
    const [g] = await db.select().from(gems).where(eq(gems.id, gemId));
    expect(g?.status).toBe("active");
    expect((await notifsFor(sellerId)).map((n) => n.type)).toEqual(["AUCTION_ENDED_NO_SALE"]);
  });

  it("reserve not met -> closed, no winner, seller notified NO_SALE", async () => {
    const bidder = await insertUser(db);
    const { sellerId, auctionId } = await endedAuction({
      reservePrice: 5000,
      bids: [{ bidderId: bidder.id, amount: 1000 }],
    });
    const res = await closeAuction(db, auctionId);
    expect(res.ok && res.outcome).toBe("closed");
    expect(res.ok && res.winnerId).toBeNull();
    const [a] = await db.select().from(auctions).where(eq(auctions.id, auctionId));
    expect(a?.status).toBe("closed");
    expect((await notifsFor(sellerId)).map((n) => n.type)).toEqual(["AUCTION_ENDED_NO_SALE"]);
  });

  it("reserve met -> sold; winner, seller, and each distinct loser notified once", async () => {
    const winner = await insertUser(db, { name: "Winner" });
    const loserA = await insertUser(db);
    const loserB = await insertUser(db);
    const { sellerId, gemId, auctionId } = await endedAuction({
      reservePrice: 1000,
      bids: [
        { bidderId: loserA.id, amount: 1000 },
        { bidderId: loserB.id, amount: 1100 },
        { bidderId: loserA.id, amount: 1200 }, // loserA bid twice
        { bidderId: winner.id, amount: 2000 },
      ],
    });
    const res = await closeAuction(db, auctionId);
    expect(res.ok && res.outcome).toBe("sold");
    expect(res.ok && res.winnerId).toBe(winner.id);

    const [a] = await db.select().from(auctions).where(eq(auctions.id, auctionId));
    expect(a?.status).toBe("sold");
    expect(a?.winnerId).toBe(winner.id);
    const [g] = await db.select().from(gems).where(eq(gems.id, gemId));
    expect(g?.status).toBe("sold");

    expect((await notifsFor(winner.id)).map((n) => n.type)).toEqual(["AUCTION_WON"]);
    expect((await notifsFor(sellerId)).map((n) => n.type)).toEqual(["AUCTION_SOLD"]);
    // Exactly one AUCTION_LOST for loserA despite two bids.
    expect((await notifsFor(loserA.id)).map((n) => n.type)).toEqual(["AUCTION_LOST"]);
    expect((await notifsFor(loserB.id)).map((n) => n.type)).toEqual(["AUCTION_LOST"]);
  });

  it("no reserve with bids -> sold to the highest bidder", async () => {
    const winner = await insertUser(db);
    const { auctionId } = await endedAuction({
      reservePrice: null,
      bids: [{ bidderId: winner.id, amount: 1500 }],
    });
    const res = await closeAuction(db, auctionId);
    expect(res.ok && res.outcome).toBe("sold");
    expect(res.ok && res.winnerId).toBe(winner.id);
  });

  it("anti-snipe race: end_at extended after selection -> close aborts, stays active", async () => {
    const { auctionId } = await endedAuction({});
    // Simulate a bid extending end_at into the future after the job picked the row.
    await db
      .update(auctions)
      .set({ endAt: new Date(Date.now() + 3_600_000) })
      .where(eq(auctions.id, auctionId));

    const res = await closeAuction(db, auctionId);
    expect(res).toEqual({ ok: false, reason: "NOT_DUE" });
    const [a] = await db.select().from(auctions).where(eq(auctions.id, auctionId));
    expect(a?.status).toBe("active");
  });

  it("idempotency: a second close is a no-op with no extra notifications", async () => {
    const winner = await insertUser(db);
    const { auctionId } = await endedAuction({ bids: [{ bidderId: winner.id, amount: 1500 }] });

    const first = await closeAuction(db, auctionId);
    expect(first.ok).toBe(true);
    const countAfterFirst = await db.$count(notifications);

    const second = await closeAuction(db, auctionId);
    expect(second).toEqual({ ok: false, reason: "ALREADY_TERMINAL" });
    expect(await db.$count(notifications)).toBe(countAfterFirst);
  });
});
