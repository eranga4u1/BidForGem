import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Schema } from "../db/client.js";
import { auctions, bids, gems, notifications, type Auction, type Bid } from "../db/schema.js";

export type PlaceBidRejection =
  | "AUCTION_NOT_FOUND"
  | "AUCTION_NOT_ACTIVE"
  | "AUCTION_NOT_STARTED"
  | "AUCTION_ENDED"
  | "BID_TOO_LOW"
  | "SELF_BID_FORBIDDEN"
  | "ALREADY_HIGHEST_BIDDER";

export type PlaceBidResult =
  | { ok: true; bid: Bid; auction: Auction; outbidUserId: string | null }
  | { ok: false; reason: PlaceBidRejection };

export interface PlaceBidInput {
  auctionId: string;
  bidderId: string;
  /** Bid amount in INTEGER minor units (cents). */
  amount: number;
}

/**
 * Place a bid on an auction, concurrency-safe.
 *
 * The entire operation runs in ONE transaction. The very first statement takes a
 * `SELECT ... FOR UPDATE` row lock on the auction, which serializes concurrent
 * bidders: every other bid for the same auction blocks here until this
 * transaction commits, so the read-validate-write sequence below is atomic and
 * the denormalized high-water mark can never be lost.
 *
 * Expected rejections are returned as `{ ok: false, reason }`; only genuine
 * faults (DB errors) throw.
 *
 * Works against any Postgres driver (PGlite or node-postgres) — the caller
 * supplies the Drizzle database.
 */
export async function placeBid<T extends PgQueryResultHKT>(
  db: PgDatabase<T, Schema>,
  input: PlaceBidInput,
): Promise<PlaceBidResult> {
  const { auctionId, bidderId, amount } = input;

  return db.transaction(async (tx) => {
    // 1. Lock the auction row FIRST. Also read the gem's seller (for the
    //    self-bid check) and the DATABASE clock (never the Node clock).
    const [row] = await tx
      .select({
        auction: auctions,
        sellerId: gems.sellerId,
        dbNow: sql<Date>`now()`,
      })
      .from(auctions)
      .innerJoin(gems, eq(gems.id, auctions.gemId))
      .where(eq(auctions.id, auctionId))
      .for("update", { of: auctions });

    if (!row) return { ok: false, reason: "AUCTION_NOT_FOUND" };

    const auction = row.auction;
    const now = new Date(row.dbNow);

    // 2. Auction must be active and within [start_at, end_at] per the DB clock.
    if (auction.status !== "active") return { ok: false, reason: "AUCTION_NOT_ACTIVE" };
    if (now < auction.startAt) return { ok: false, reason: "AUCTION_NOT_STARTED" };
    if (now > auction.endAt) return { ok: false, reason: "AUCTION_ENDED" };

    // 3. amount >= max(start_price, highest_bid + min_increment).
    //    When there is no highest bid yet, the floor is start_price.
    const floor =
      auction.highestBid === null
        ? auction.startPrice
        : Math.max(auction.startPrice, auction.highestBid + auction.minIncrement);
    if (amount < floor) return { ok: false, reason: "BID_TOO_LOW" };

    // 4. Sellers may not bid on their own gems.
    if (row.sellerId === bidderId) return { ok: false, reason: "SELF_BID_FORBIDDEN" };

    // 5. The current highest bidder is already winning; reject a re-bid.
    if (auction.highestBidderId === bidderId) {
      return { ok: false, reason: "ALREADY_HIGHEST_BIDDER" };
    }

    // The bidder currently holding the top spot (if any) is about to be displaced.
    const outbidUserId = auction.highestBidderId;

    // 6. Insert the bid.
    const [bid] = await tx.insert(bids).values({ auctionId, bidderId, amount }).returning();
    if (!bid) throw new Error("Bid insert returned no row");

    // Outbid notification for the displaced leader — SAME transaction as the bid.
    if (outbidUserId !== null) {
      await tx.insert(notifications).values({
        userId: outbidUserId,
        type: "OUTBID",
        payload: { auctionId, amount, currency: auction.currency },
      });
    }

    // Anti-snipe: if this winning bid lands within the window of end_at, extend.
    let endAt = auction.endAt;
    const { antiSnipeWindowSeconds: windowS, antiSnipeExtendSeconds: extendS } = auction;
    if (windowS > 0 && extendS > 0) {
      const msLeft = auction.endAt.getTime() - now.getTime();
      if (msLeft <= windowS * 1000) {
        endAt = new Date(auction.endAt.getTime() + extendS * 1000);
      }
    }

    // 7. Update the high-water mark (and possibly the extended end) — still
    //    inside the transaction, still under the lock from step 1.
    const [updated] = await tx
      .update(auctions)
      .set({ highestBid: amount, highestBidderId: bidderId, endAt })
      .where(eq(auctions.id, auctionId))
      .returning();
    if (!updated) throw new Error("Auction update returned no row");

    return { ok: true, bid, auction: updated, outbidUserId };
  });
}
