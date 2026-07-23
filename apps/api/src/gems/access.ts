import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Schema } from "../db/client.js";
import { auctions, bids, gems, media, type Gem, type Media } from "../db/schema.js";

export type Db = PgDatabase<PgQueryResultHKT, Schema>;

/** Load a gem by id, or null. Soft-deleted rows are returned (callers decide). */
export async function loadGem(db: Db, gemId: string): Promise<Gem | null> {
  const [row] = await db.select().from(gems).where(eq(gems.id, gemId)).limit(1);
  return row ?? null;
}

export function isDeleted(gem: Gem): boolean {
  return gem.deletedAt !== null;
}

/** Ready (completed) media for a gem — pending uploads are never included. */
export function readyMedia(db: Db, gemId: string): Promise<Media[]> {
  return db
    .select()
    .from(media)
    .where(and(eq(media.gemId, gemId), eq(media.status, "ready")));
}

/**
 * A gem is "locked" once people can/do bid on it: it has a scheduled/active
 * auction, or any bid exists against one of its auctions. Locked gems must not
 * be edited, unpublished, or withdrawn — that would change what people bid on.
 */
export async function isGemLocked(db: Db, gemId: string): Promise<boolean> {
  const liveAuction = await db
    .select({ id: auctions.id })
    .from(auctions)
    .where(and(eq(auctions.gemId, gemId), inArray(auctions.status, ["scheduled", "active"])))
    .limit(1);
  if (liveAuction.length > 0) return true;

  const anyBid = await db
    .select({ id: bids.id })
    .from(bids)
    .innerJoin(auctions, eq(auctions.id, bids.auctionId))
    .where(eq(auctions.gemId, gemId))
    .limit(1);
  return anyBid.length > 0;
}
