import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for the Gem platform.
 *
 * The SQL migrations under `apps/api/migrations` are the source of truth for the
 * database. This file mirrors the migrated state so Drizzle's typed query builder
 * maps to the real columns. Money is stored as INTEGER minor units (bigint);
 * physical quantities use scaled integers (e.g. carat -> carat_milli).
 */

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const gemStatus = pgEnum("gem_status", ["draft", "active", "sold", "closed"]);
export const auctionStatus = pgEnum("auction_status", [
  "scheduled",
  "active",
  "closed",
  "canceled",
]);
export const mediaType = pgEnum("media_type", ["photo", "video", "certificate"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("user"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gems = pgTable(
  "gems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull(),
    caratMilli: integer("carat_milli").notNull(),
    color: text("color"),
    clarity: text("clarity"),
    cut: text("cut"),
    origin: text("origin"),
    status: gemStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("gems_carat_milli_nonneg", sql`${t.caratMilli} >= 0`)],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gemId: uuid("gem_id")
      .notNull()
      .references(() => gems.id, { onDelete: "cascade" }),
    type: mediaType("type").notNull(),
    url: text("url").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
  },
  (t) => [check("media_size_nonneg", sql`${t.size} >= 0`)],
);

export const auctions = pgTable(
  "auctions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gemId: uuid("gem_id")
      .notNull()
      .references(() => gems.id),
    startPrice: bigint("start_price", { mode: "number" }).notNull(),
    reservePrice: bigint("reserve_price", { mode: "number" }),
    minIncrement: bigint("min_increment", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: auctionStatus("status").notNull().default("scheduled"),
    // Denormalized high-water mark, updated INSIDE the bid transaction under the
    // auction row lock. Never derived via MAX() at read time.
    highestBid: bigint("highest_bid", { mode: "number" }),
    highestBidderId: uuid("highest_bidder_id").references(() => users.id),
    winnerId: uuid("winner_id").references(() => users.id),
    // Anti-snipe: a winning bid within `window` seconds of end_at pushes end_at
    // out by `extend` seconds. 0 disables. Added in migration 0002.
    antiSnipeWindowSeconds: integer("anti_snipe_window_seconds").notNull().default(30),
    antiSnipeExtendSeconds: integer("anti_snipe_extend_seconds").notNull().default(60),
  },
  (t) => [
    check("auctions_start_price_nonneg", sql`${t.startPrice} >= 0`),
    check("auctions_reserve_nonneg", sql`${t.reservePrice} IS NULL OR ${t.reservePrice} >= 0`),
    check("auctions_min_increment_pos", sql`${t.minIncrement} > 0`),
    check("auctions_time_order", sql`${t.endAt} > ${t.startAt}`),
    check("auctions_highest_bid_nonneg", sql`${t.highestBid} IS NULL OR ${t.highestBid} >= 0`),
    check("auctions_anti_snipe_window_nonneg", sql`${t.antiSnipeWindowSeconds} >= 0`),
    check("auctions_anti_snipe_extend_nonneg", sql`${t.antiSnipeExtendSeconds} >= 0`),
    index("auctions_status_end_at_idx").on(t.status, t.endAt),
  ],
);

export const bids = pgTable(
  "bids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auctionId: uuid("auction_id")
      .notNull()
      .references(() => auctions.id, { onDelete: "cascade" }),
    bidderId: uuid("bidder_id")
      .notNull()
      .references(() => users.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("bids_amount_pos", sql`${t.amount} > 0`),
    index("bids_auction_amount_idx").on(t.auctionId, sql`${t.amount} DESC`),
  ],
);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true }),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 hash of the opaque token; the raw token is never stored.
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [
    index("refresh_tokens_token_hash_idx").on(t.tokenHash),
    index("refresh_tokens_user_id_idx").on(t.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type Gem = typeof gems.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Auction = typeof auctions.$inferSelect;
export type Bid = typeof bids.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
