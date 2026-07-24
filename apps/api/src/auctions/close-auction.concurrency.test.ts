import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPoolDatabase } from "../db/client.js";
import { auctions, bids, gems, notifications, users } from "../db/schema.js";
import { runMigrations } from "../db/migrate.js";
import { startRealPg, type RealPg } from "../test/real-pg.js";
import { closeAuction } from "./close-auction.js";

/**
 * Two workers must not both close the same auction. Needs REAL PostgreSQL with a
 * connection pool — single-connection PGlite serializes at the client and cannot
 * prove the FOR UPDATE arbitration.
 */
describe("closeAuction concurrency (real PostgreSQL)", () => {
  let real: RealPg | null = null;

  beforeAll(async () => {
    real = await startRealPg();
    if (real) await runMigrations(createPoolDatabase(real.pool).driver);
  });
  afterAll(async () => {
    await real?.stop();
  });

  it("two concurrent closes on the same auction: exactly one closes", async (ctx) => {
    if (!real) {
      ctx.skip();
      return;
    }
    const { db } = real;
    const now = Date.now();

    const [seller] = await db
      .insert(users)
      .values({ name: "Seller", email: `seller-${now}@t.test`, passwordHash: "x" })
      .returning();
    const [winner] = await db
      .insert(users)
      .values({ name: "Winner", email: `winner-${now}@t.test`, passwordHash: "x" })
      .returning();
    const [gem] = await db
      .insert(gems)
      .values({
        sellerId: seller!.id,
        title: "Ruby",
        type: "ruby",
        caratMilli: 1000,
        status: "active",
      })
      .returning();
    const [auction] = await db
      .insert(auctions)
      .values({
        gemId: gem!.id,
        startPrice: 1000,
        minIncrement: 100,
        currency: "USD",
        startAt: new Date(now - 7_200_000),
        endAt: new Date(now - 3_600_000),
        status: "active",
        highestBid: 1500,
        highestBidderId: winner!.id,
      })
      .returning();
    await db.insert(bids).values({ auctionId: auction!.id, bidderId: winner!.id, amount: 1500 });

    // Fire both closes at once over the pool (genuinely parallel).
    const [r1, r2] = await Promise.all([
      closeAuction(db, auction!.id),
      closeAuction(db, auction!.id),
    ]);

    const winners = [r1, r2].filter((r) => r.ok);
    const losers = [r1, r2].filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toEqual({ ok: false, reason: "ALREADY_TERMINAL" });

    // Auction sold exactly once; notifications inserted exactly once (winner + seller).
    const [persisted] = await db.select().from(auctions).where(eq(auctions.id, auction!.id));
    expect(persisted?.status).toBe("sold");
    expect(persisted?.winnerId).toBe(winner!.id);
    const notifCount = await db.$count(notifications, eq(notifications.userId, seller!.id));
    expect(notifCount).toBe(1); // seller: exactly one AUCTION_SOLD
  });
});
