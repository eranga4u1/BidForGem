import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrate.js";
import { auctions, bids, gems, users } from "../db/schema.js";
import { createPoolDatabase } from "../db/client.js";
import { startRealPg, type RealPg } from "../test/real-pg.js";
import { placeBid } from "./place-bid.js";

/**
 * The critical concurrency proof. This MUST run against a real PostgreSQL with a
 * multi-connection pool: single-connection PGlite serializes calls at the client
 * and would pass this test without ever exercising the row lock (a false green).
 *
 * `startRealPg()` uses DATABASE_URL if set, else boots an embedded PostgreSQL 17.
 * If neither is available the test is skipped loudly rather than faked.
 */
describe("placeBid concurrency (real PostgreSQL, multi-connection)", () => {
  let real: RealPg | null = null;

  beforeAll(async () => {
    real = await startRealPg();
    if (real) {
      const { driver } = createPoolDatabase(real.pool);
      await runMigrations(driver);
    }
  });

  afterAll(async () => {
    await real?.stop();
  });

  it("N=10 simultaneous equal bids: exactly one wins, nine are BID_TOO_LOW", async (ctx) => {
    if (!real) {
      ctx.skip();
      return;
    }
    const { db } = real;

    // Fixtures: a seller, an active auction, and 10 distinct bidders.
    const [seller] = await db
      .insert(users)
      .values({ name: "Seller", email: `seller-${Date.now()}@t.test`, passwordHash: "x" })
      .returning();
    const [gem] = await db
      .insert(gems)
      .values({
        sellerId: seller!.id,
        title: "Ruby",
        type: "ruby",
        caratMilli: 3000,
        status: "active",
      })
      .returning();
    const now = Date.now();
    const [auction] = await db
      .insert(auctions)
      .values({
        gemId: gem!.id,
        startPrice: 1000,
        minIncrement: 100,
        currency: "USD",
        startAt: new Date(now - 60_000),
        endAt: new Date(now + 3_600_000),
        status: "active",
      })
      .returning();

    const bidders = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db
          .insert(users)
          .values({ name: `Bidder ${i}`, email: `bidder-${i}-${now}@t.test`, passwordHash: "x" })
          .returning()
          .then((r) => r[0]!),
      ),
    );

    // Fire all 10 identical bids at once. Each goes through the pool on its own
    // connection, so the transactions genuinely overlap and contend on the
    // auction row lock.
    const results = await Promise.all(
      bidders.map((b) => placeBid(db, { auctionId: auction!.id, bidderId: b.id, amount: 1000 })),
    );

    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(9);
    expect(losers.every((r) => !r.ok && r.reason === "BID_TOO_LOW")).toBe(true);

    // Exactly one bid row was inserted.
    const bidRows = await db.select().from(bids).where(eq(bids.auctionId, auction!.id));
    expect(bidRows).toHaveLength(1);

    // The high-water mark matches the single winner.
    const [persisted] = await db.select().from(auctions).where(eq(auctions.id, auction!.id));
    const winner = winners[0]!;
    if (!winner.ok) throw new Error("unreachable");
    expect(persisted?.highestBid).toBe(1000);
    expect(persisted?.highestBidderId).toBe(winner.bid.bidderId);
    expect(bidRows[0]?.bidderId).toBe(winner.bid.bidderId);
  });
});
