import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { PostingFee, PostingFeeSettings } from "@gem/types";
import { appSettings, gems } from "../db/schema.js";
import type { Db } from "../gems/access.js";

/**
 * "Counts against quota" = a user's currently PUBLISHED listings: gems whose
 * status is no longer 'draft' and which are not soft-deleted. A draft never
 * counts; the gem being published is still a draft at resolve time, so it is
 * correctly excluded.
 */
export function countPublishedListings(db: Db, userId: string): Promise<number> {
  return db.$count(
    gems,
    and(eq(gems.sellerId, userId), ne(gems.status, "draft"), isNull(gems.deletedAt)),
  );
}

/** DB clock (the seeded app_settings row guarantees a source row). */
async function databaseNow(db: Db): Promise<Date> {
  const [row] = await db
    .select({ now: sql<Date>`now()` })
    .from(appSettings)
    .limit(1);
  return row ? new Date(row.now) : new Date();
}

/**
 * Resolve whether a user's publish requires a posting fee. First match wins:
 *   1. disabled            -> free
 *   2. within free_until   -> free (promo window; DB clock)
 *   3. under free_quota     -> free
 *   4. otherwise           -> required (amount + currency from settings)
 *
 * `settings` is the (cached, validated) posting-fee configuration; flipping the
 * platform to paid is purely a change to that data — no code change here.
 */
export async function resolvePostingFee(
  db: Db,
  settings: PostingFeeSettings,
  userId: string,
): Promise<PostingFee> {
  if (!settings.enabled) {
    return { required: false, amount: 0, currency: settings.currency };
  }

  if (settings.free_until !== null) {
    const now = await databaseNow(db);
    if (now.getTime() < settings.free_until.getTime()) {
      return { required: false, amount: 0, currency: settings.currency };
    }
  }

  if (settings.free_quota > 0) {
    const published = await countPublishedListings(db, userId);
    if (published < settings.free_quota) {
      return { required: false, amount: 0, currency: settings.currency };
    }
  }

  return { required: true, amount: settings.amount, currency: settings.currency };
}
