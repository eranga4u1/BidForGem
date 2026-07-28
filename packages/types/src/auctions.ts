import { z } from "zod";

export const auctionStatusSchema = z.enum(["scheduled", "active", "closed", "canceled", "sold"]);
export type AuctionStatus = z.infer<typeof auctionStatusSchema>;

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code"),
  );

/** Auction duration bounds, in seconds: 1 minute .. 30 days. */
export const AUCTION_MIN_DURATION_SECONDS = 60;
export const AUCTION_MAX_DURATION_SECONDS = 30 * 24 * 60 * 60; // 2,592,000

/**
 * Money fields are INTEGER minor units — non-integers are rejected here.
 *
 * The DEADLINE is server-authoritative. The client sends a bounded
 * `durationSeconds`, NEVER an absolute `endAt` (a skewed client clock must not be
 * able to mis-time an auction). `startAt` is OPTIONAL and, when present, is only
 * a REQUEST the server validates against its own DB clock (must be in the
 * future) — omit it to start immediately. The server computes both `start_at`
 * and `end_at` from its DB clock. `endAt` is intentionally absent from this
 * schema, so any client-supplied value is stripped before it can reach the
 * domain logic.
 */
export const createAuctionInputSchema = z.object({
  gemId: z.uuid(),
  startPrice: z.number().int().nonnegative(),
  reservePrice: z.number().int().nonnegative().optional(),
  minIncrement: z.number().int().positive(),
  currency: currencySchema,
  durationSeconds: z
    .number()
    .int()
    .min(AUCTION_MIN_DURATION_SECONDS)
    .max(AUCTION_MAX_DURATION_SECONDS),
  startAt: z.coerce.date().optional(),
  antiSnipeWindowSeconds: z.number().int().nonnegative().optional(),
  antiSnipeExtendSeconds: z.number().int().nonnegative().optional(),
});
export type CreateAuctionInput = z.infer<typeof createAuctionInputSchema>;

export const placeBidInputSchema = z.object({
  amount: z.number().int().positive(),
});
export type PlaceBidInputDto = z.infer<typeof placeBidInputSchema>;

export const auctionFilterSchema = z.object({
  status: auctionStatusSchema.optional(),
  gemType: z.string().trim().optional(),
  /** Only auctions ending at or before this instant (for "ending soon"). */
  endingBefore: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AuctionFilter = z.infer<typeof auctionFilterSchema>;

export const bidHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type BidHistoryQuery = z.infer<typeof bidHistoryQuerySchema>;

export const publicAuctionSchema = z.object({
  id: z.uuid(),
  gemId: z.uuid(),
  status: auctionStatusSchema,
  currency: z.string(),
  startPrice: z.number().int(),
  reservePrice: z.number().int().nullable(),
  minIncrement: z.number().int(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  highestBid: z.number().int().nullable(),
  bidCount: z.number().int(),
  antiSnipeWindowSeconds: z.number().int(),
  antiSnipeExtendSeconds: z.number().int(),
});
export type PublicAuction = z.infer<typeof publicAuctionSchema>;

/** A single bid in the public history. Display name only — never email/user id. */
export const bidHistoryItemSchema = z.object({
  id: z.uuid(),
  amount: z.number().int(),
  createdAt: z.coerce.date(),
  bidderDisplayName: z.string(),
});
export type BidHistoryItem = z.infer<typeof bidHistoryItemSchema>;

// --- Socket.IO event payloads (namespace `/auctions`) ---

/** Emitted to `auction:<id>` after a bid commits. Contains NO PII. */
export interface BidPlacedEvent {
  auctionId: string;
  amount: number;
  bidderDisplayName: string;
  highestBid: number;
  bidCount: number;
  endAt: string;
}

export interface AuctionExtendedEvent {
  auctionId: string;
  endAt: string;
}

export interface AuctionClosedEvent {
  auctionId: string;
  winnerId: string | null;
  finalAmount: number | null;
}

export interface JoinAuctionMessage {
  auctionId: string;
}
