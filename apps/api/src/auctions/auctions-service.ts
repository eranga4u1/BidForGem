import { and, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  auctionFilterSchema,
  bidHistoryQuerySchema,
  createAuctionInputSchema,
  type BidHistoryItem,
  type BidOutcome,
  type MyBid,
  type PublicAuction,
} from "@gem/contracts";
import type { ZodError } from "zod";
import { auctions, bids, gems, media, users } from "../db/schema.js";
import { isDeleted, loadGem, type Db } from "../gems/access.js";
import { toBidHistoryItem, toPublicAuction } from "./mappers.js";

type Issues = ZodError["issues"];

/** Ended statuses used by the coarse `state=ended` browse filter. */
const ENDED_STATUSES = ["closed", "sold", "canceled"] as const;

/** The signed-in user's standing in an auction, from its status + winner. */
function bidOutcome(
  status: string,
  highestBidderId: string | null,
  winnerId: string | null,
  userId: string,
): BidOutcome {
  if (status === "active") return highestBidderId === userId ? "leading" : "outbid";
  if (status === "sold") return winnerId === userId ? "won" : "lost";
  return "ended";
}

export type CreateAuctionResult =
  | { ok: true; auction: PublicAuction }
  | { ok: false; reason: "INVALID_INPUT"; issues: Issues }
  | {
      ok: false;
      reason:
        | "GEM_NOT_FOUND"
        | "NOT_GEM_OWNER"
        | "GEM_NOT_ACTIVE"
        | "AUCTION_ALREADY_EXISTS"
        | "START_IN_PAST"
        | "RESERVE_BELOW_START";
    };

export type GetAuctionResult =
  { ok: true; auction: PublicAuction } | { ok: false; reason: "NOT_FOUND" };

export type ListAuctionsResult =
  | { ok: true; items: PublicAuction[]; limit: number; offset: number }
  | { ok: false; reason: "INVALID_INPUT"; issues: Issues };

export type CancelAuctionResult =
  | { ok: true; auction: PublicAuction }
  | {
      ok: false;
      reason: "NOT_FOUND" | "FORBIDDEN" | "AUCTION_HAS_BIDS" | "AUCTION_NOT_CANCELABLE";
    };

export type BidHistoryResult =
  | { ok: true; items: BidHistoryItem[]; limit: number; offset: number }
  | { ok: false; reason: "INVALID_INPUT"; issues: Issues }
  | { ok: false; reason: "NOT_FOUND" };

export type MyBidsResult =
  | { ok: true; items: MyBid[]; limit: number; offset: number }
  | { ok: false; reason: "INVALID_INPUT"; issues: Issues };

export interface AuctionsService {
  create(sellerId: string, input: unknown): Promise<CreateAuctionResult>;
  get(auctionId: string): Promise<GetAuctionResult>;
  list(filters: unknown): Promise<ListAuctionsResult>;
  cancel(sellerId: string, auctionId: string): Promise<CancelAuctionResult>;
  bidHistory(auctionId: string, query: unknown): Promise<BidHistoryResult>;
  listMyBids(userId: string, query: unknown): Promise<MyBidsResult>;
}

export interface AuctionsServiceDeps {
  db: Db;
}

export function createAuctionsService(deps: AuctionsServiceDeps): AuctionsService {
  const { db } = deps;

  const countBids = (auctionId: string): Promise<number> =>
    db.$count(bids, eq(bids.auctionId, auctionId));

  /**
   * The server's own clock — the DB clock, the SAME source `closeAuction` trusts
   * to decide when an auction is due. `now()` is constant per statement, so any
   * present row works as a carrier; the gem we just validated guarantees one.
   */
  const databaseNow = async (gemId: string): Promise<Date> => {
    const [row] = await db
      .select({ now: sql<Date>`now()` })
      .from(gems)
      .where(eq(gems.id, gemId));
    return row ? new Date(row.now) : new Date();
  };

  return {
    async create(sellerId, rawInput) {
      const parsed = createAuctionInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      }
      const input = parsed.data;

      const gem = await loadGem(db, input.gemId);
      if (!gem || isDeleted(gem)) return { ok: false, reason: "GEM_NOT_FOUND" };
      if (gem.sellerId !== sellerId) return { ok: false, reason: "NOT_GEM_OWNER" };
      if (gem.status !== "active") return { ok: false, reason: "GEM_NOT_ACTIVE" };

      const existing = await db
        .select({ id: auctions.id })
        .from(auctions)
        .where(
          and(eq(auctions.gemId, input.gemId), inArray(auctions.status, ["scheduled", "active"])),
        )
        .limit(1);
      if (existing.length > 0) return { ok: false, reason: "AUCTION_ALREADY_EXISTS" };

      if (input.reservePrice !== undefined && input.reservePrice < input.startPrice) {
        return { ok: false, reason: "RESERVE_BELOW_START" };
      }

      // SERVER-authoritative deadline: derive start_at and end_at from the DB
      // clock, never from a client-supplied instant. `startAt` (if sent) is only
      // a request the server validates as future; otherwise the auction starts
      // now. end_at is always start_at + duration.
      const dbNow = await databaseNow(input.gemId);
      let startAt: Date;
      if (input.startAt === undefined) {
        startAt = dbNow;
      } else {
        if (input.startAt.getTime() <= dbNow.getTime()) {
          return { ok: false, reason: "START_IN_PAST" };
        }
        startAt = input.startAt;
      }
      const endAt = new Date(startAt.getTime() + input.durationSeconds * 1000);
      const status = startAt.getTime() <= dbNow.getTime() ? "active" : "scheduled";

      const [row] = await db
        .insert(auctions)
        .values({
          gemId: input.gemId,
          startPrice: input.startPrice,
          reservePrice: input.reservePrice ?? null,
          minIncrement: input.minIncrement,
          currency: input.currency,
          startAt,
          endAt,
          status,
          ...(input.antiSnipeWindowSeconds !== undefined
            ? { antiSnipeWindowSeconds: input.antiSnipeWindowSeconds }
            : {}),
          ...(input.antiSnipeExtendSeconds !== undefined
            ? { antiSnipeExtendSeconds: input.antiSnipeExtendSeconds }
            : {}),
        })
        .returning();
      if (!row) throw new Error("Auction insert returned no row");
      return { ok: true, auction: toPublicAuction(row, 0) };
    },

    async get(auctionId) {
      const [row] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
      if (!row) return { ok: false, reason: "NOT_FOUND" };
      return { ok: true, auction: toPublicAuction(row, await countBids(auctionId)) };
    },

    async list(rawFilters) {
      const parsed = auctionFilterSchema.safeParse(rawFilters ?? {});
      if (!parsed.success) {
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      }
      const f = parsed.data;

      const conditions = [];
      if (f.status) conditions.push(eq(auctions.status, f.status));
      if (f.state === "live") conditions.push(eq(auctions.status, "active"));
      else if (f.state === "ended") conditions.push(inArray(auctions.status, [...ENDED_STATUSES]));
      if (f.gemId) conditions.push(eq(auctions.gemId, f.gemId));
      if (f.endingBefore) conditions.push(lte(auctions.endAt, f.endingBefore));
      if (f.gemType) conditions.push(eq(gems.type, f.gemType));

      const orderBy = f.sort === "newest" ? desc(auctions.startAt) : auctions.endAt;

      const rows = await db
        .select({ auction: auctions })
        .from(auctions)
        .innerJoin(gems, eq(gems.id, auctions.gemId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderBy)
        .limit(f.limit)
        .offset(f.offset);

      const items = await Promise.all(
        rows.map(async (r) => toPublicAuction(r.auction, await countBids(r.auction.id))),
      );
      return { ok: true, items, limit: f.limit, offset: f.offset };
    },

    async cancel(sellerId, auctionId) {
      const [row] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
      if (!row) return { ok: false, reason: "NOT_FOUND" };

      const gem = await loadGem(db, row.gemId);
      if (!gem || gem.sellerId !== sellerId) return { ok: false, reason: "FORBIDDEN" };
      if (row.status !== "scheduled" && row.status !== "active") {
        return { ok: false, reason: "AUCTION_NOT_CANCELABLE" };
      }
      if ((await countBids(auctionId)) > 0) return { ok: false, reason: "AUCTION_HAS_BIDS" };

      const [updated] = await db
        .update(auctions)
        .set({ status: "canceled" })
        .where(eq(auctions.id, auctionId))
        .returning();
      if (!updated) throw new Error("Auction cancel returned no row");
      return { ok: true, auction: toPublicAuction(updated, 0) };
    },

    async bidHistory(auctionId, rawQuery) {
      const parsed = bidHistoryQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) {
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      }
      const [auction] = await db
        .select({ id: auctions.id })
        .from(auctions)
        .where(eq(auctions.id, auctionId))
        .limit(1);
      if (!auction) return { ok: false, reason: "NOT_FOUND" };

      const rows = await db
        .select({
          id: bids.id,
          amount: bids.amount,
          createdAt: bids.createdAt,
          bidderDisplayName: users.name,
        })
        .from(bids)
        .innerJoin(users, eq(users.id, bids.bidderId))
        .where(eq(bids.auctionId, auctionId))
        // Newest first; amount as a deterministic tiebreaker for same-ms inserts.
        .orderBy(desc(bids.createdAt), desc(bids.amount))
        .limit(parsed.data.limit)
        .offset(parsed.data.offset);

      return {
        ok: true,
        items: rows.map(toBidHistoryItem),
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      };
    },

    async listMyBids(userId, rawQuery) {
      const parsed = bidHistoryQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) {
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      }
      const { limit, offset } = parsed.data;

      // One row per auction the user has bid on: their highest bid + the
      // auction's current standing, newest activity first.
      const rows = await db
        .select({
          auctionId: auctions.id,
          gemId: auctions.gemId,
          gemTitle: gems.title,
          currency: auctions.currency,
          status: auctions.status,
          endAt: auctions.endAt,
          highestBid: auctions.highestBid,
          highestBidderId: auctions.highestBidderId,
          winnerId: auctions.winnerId,
          myMaxBid: sql<string>`max(${bids.amount})`,
          lastBidAt: sql<string>`max(${bids.createdAt})`,
        })
        .from(bids)
        .innerJoin(auctions, eq(auctions.id, bids.auctionId))
        .innerJoin(gems, eq(gems.id, auctions.gemId))
        .where(eq(bids.bidderId, userId))
        .groupBy(auctions.id, gems.id)
        .orderBy(desc(sql`max(${bids.createdAt})`))
        .limit(limit)
        .offset(offset);

      const gemIds = rows.map((r) => r.gemId);
      const photoByGem = new Map<string, string>();
      if (gemIds.length > 0) {
        const photos = await db
          .select({ gemId: media.gemId, url: media.url })
          .from(media)
          .where(
            and(
              inArray(media.gemId, gemIds),
              eq(media.type, "photo"),
              eq(media.status, "ready"),
              isNotNull(media.url),
            ),
          );
        for (const p of photos) {
          if (p.url && !photoByGem.has(p.gemId)) photoByGem.set(p.gemId, p.url);
        }
      }

      const items: MyBid[] = rows.map((r) => ({
        auctionId: r.auctionId,
        gemId: r.gemId,
        gemTitle: r.gemTitle,
        photoUrl: photoByGem.get(r.gemId) ?? null,
        currency: r.currency,
        myMaxBid: Number(r.myMaxBid),
        highestBid: r.highestBid,
        status: r.status,
        endAt: r.endAt,
        lastBidAt: new Date(r.lastBidAt),
        outcome: bidOutcome(r.status, r.highestBidderId, r.winnerId, userId),
      }));
      return { ok: true, items, limit, offset };
    },
  };
}
