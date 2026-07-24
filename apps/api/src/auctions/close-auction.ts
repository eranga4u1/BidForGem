import { and, eq, ne, sql } from "drizzle-orm";
import type { NotificationType } from "@gem/types";
import { auctions, bids, gems, notifications } from "../db/schema.js";
import type { Db } from "../gems/access.js";

export type CloseAuctionOutcome = "sold" | "closed";

export interface CreatedNotification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export type CloseAuctionResult =
  | {
      ok: true;
      outcome: CloseAuctionOutcome;
      winnerId: string | null;
      finalAmount: number | null;
      sellerId: string;
      notifications: CreatedNotification[];
    }
  | { ok: false; reason: "NOT_FOUND" | "NOT_DUE" | "ALREADY_TERMINAL" };

type NotificationInsert = {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
};

/**
 * Close an auction in ONE transaction. SERVER-DRIVEN only — the caller (a
 * scheduled job) supplies the id; timing is judged by the DATABASE clock.
 *
 * The `SELECT ... FOR UPDATE` lock plus the terminal-status check make this safe
 * to call twice and safe against two workers racing: exactly one closes. The
 * end_at is re-read UNDER THE LOCK so a bid that anti-snipe-extended the auction
 * after the job selected it aborts the close (NOT_DUE).
 */
export async function closeAuction(db: Db, auctionId: string): Promise<CloseAuctionResult> {
  return db.transaction(async (tx) => {
    // 1. Lock the auction row (+ read seller and the DB clock).
    const [row] = await tx
      .select({ auction: auctions, sellerId: gems.sellerId, dbNow: sql<Date>`now()` })
      .from(auctions)
      .innerJoin(gems, eq(gems.id, auctions.gemId))
      .where(eq(auctions.id, auctionId))
      .for("update", { of: auctions });
    if (!row) return { ok: false, reason: "NOT_FOUND" };

    const auction = row.auction;
    const dbNow = new Date(row.dbNow);

    // 2. Re-read end_at under the lock — abort if it is still in the future.
    if (auction.endAt.getTime() > dbNow.getTime()) return { ok: false, reason: "NOT_DUE" };

    // 3. Idempotency / no double-close: only an 'active' auction can close.
    if (auction.status !== "active") return { ok: false, reason: "ALREADY_TERMINAL" };

    // 4. Outcome.
    const hasBids = auction.highestBid !== null;
    const reserveMet =
      auction.reservePrice === null ||
      (auction.highestBid !== null && auction.highestBid >= auction.reservePrice);
    const sold = hasBids && reserveMet;

    const payloadBase = { auctionId, gemId: auction.gemId };
    const notif: NotificationInsert[] = [];

    if (sold) {
      const winnerId = auction.highestBidderId;
      if (winnerId === null) throw new Error("Sold auction has no highest bidder");
      const finalAmount = auction.highestBid;

      // 5. auction -> sold (winner set); gem -> sold.
      await tx.update(auctions).set({ status: "sold", winnerId }).where(eq(auctions.id, auctionId));
      await tx.update(gems).set({ status: "sold" }).where(eq(gems.id, auction.gemId));

      // 6. Notifications: winner, seller, and one per DISTINCT losing bidder.
      notif.push({
        userId: winnerId,
        type: "AUCTION_WON",
        payload: { ...payloadBase, finalAmount },
      });
      notif.push({
        userId: row.sellerId,
        type: "AUCTION_SOLD",
        payload: { ...payloadBase, finalAmount },
      });
      const losers = await tx
        .selectDistinct({ bidderId: bids.bidderId })
        .from(bids)
        .where(and(eq(bids.auctionId, auctionId), ne(bids.bidderId, winnerId)));
      for (const loser of losers) {
        notif.push({ userId: loser.bidderId, type: "AUCTION_LOST", payload: payloadBase });
      }
    } else {
      // No sale (no bids, or reserve not met): auction -> closed; gem -> active.
      await tx
        .update(auctions)
        .set({ status: "closed", winnerId: null })
        .where(eq(auctions.id, auctionId));
      await tx.update(gems).set({ status: "active" }).where(eq(gems.id, auction.gemId));
      notif.push({ userId: row.sellerId, type: "AUCTION_ENDED_NO_SALE", payload: payloadBase });
    }

    const inserted =
      notif.length > 0 ? await tx.insert(notifications).values(notif).returning() : [];

    return {
      ok: true,
      outcome: sold ? "sold" : "closed",
      winnerId: sold ? auction.highestBidderId : null,
      finalAmount: sold ? auction.highestBid : null,
      sellerId: row.sellerId,
      notifications: inserted.map((n) => ({
        id: n.id,
        userId: n.userId,
        type: n.type as NotificationType,
        payload: n.payload,
        createdAt: n.createdAt,
      })),
    };
  });
}
