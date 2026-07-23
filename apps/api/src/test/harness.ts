import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { createPgliteDatabase, type Schema } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { seedCoreSettings } from "../db/seed.js";
import { auctions, gems, users, type Auction, type Gem, type User } from "../db/schema.js";

/** Any Drizzle database backed by a Postgres-compatible driver. */
export type AnyDb<T extends PgQueryResultHKT = PgQueryResultHKT> = PgDatabase<T, Schema>;

let seq = 0;
const uniq = (): number => ++seq;

/** Boot a fresh in-process PGlite database with migrations + core seed applied. */
export async function makeTestDb(): Promise<{
  db: ReturnType<typeof createPgliteDatabase>["db"];
  close: () => Promise<void>;
}> {
  const { db, client, driver } = createPgliteDatabase();
  await runMigrations(driver);
  await seedCoreSettings(db);
  return { db, close: () => client.close() };
}

export async function insertUser(db: AnyDb, overrides: Partial<User> = {}): Promise<User> {
  const n = uniq();
  const [user] = await db
    .insert(users)
    .values({
      name: overrides.name ?? `User ${n}`,
      email: overrides.email ?? `user${n}@example.test`,
      passwordHash: overrides.passwordHash ?? "x",
      ...overrides,
    })
    .returning();
  if (!user) throw new Error("insertUser returned no row");
  return user;
}

export async function insertGem(
  db: AnyDb,
  sellerId: string,
  overrides: Partial<Gem> = {},
): Promise<Gem> {
  const [gem] = await db
    .insert(gems)
    .values({
      sellerId,
      title: overrides.title ?? "Blue Sapphire",
      type: overrides.type ?? "sapphire",
      caratMilli: overrides.caratMilli ?? 2500,
      status: overrides.status ?? "active",
      ...overrides,
    })
    .returning();
  if (!gem) throw new Error("insertGem returned no row");
  return gem;
}

export interface AuctionOverrides extends Partial<Auction> {
  startPrice?: number;
  minIncrement?: number;
}

/**
 * Insert an auction. Defaults to an ACTIVE auction whose window comfortably
 * contains "now" so bids are accepted; individual tests override timing/status.
 */
export async function insertAuction(
  db: AnyDb,
  gemId: string,
  overrides: AuctionOverrides = {},
): Promise<Auction> {
  const now = Date.now();
  const [auction] = await db
    .insert(auctions)
    .values({
      gemId,
      startPrice: overrides.startPrice ?? 1000,
      minIncrement: overrides.minIncrement ?? 100,
      reservePrice: overrides.reservePrice ?? null,
      currency: overrides.currency ?? "USD",
      startAt: overrides.startAt ?? new Date(now - 60_000),
      endAt: overrides.endAt ?? new Date(now + 3_600_000),
      status: overrides.status ?? "active",
      ...overrides,
    })
    .returning();
  if (!auction) throw new Error("insertAuction returned no row");
  return auction;
}
