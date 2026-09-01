import { z } from "zod";
import { notificationTypeSchema } from "./notifications.js";

/**
 * Typed Socket.IO event map for the `/auctions` namespace. Only the type/schema
 * map lives here — the socket *client* is app-specific and stays in each app.
 *
 * NOTE: unlike the REST schemas (which `z.coerce.date()` timestamps), realtime
 * event timestamps stay as ISO strings on the wire — these events are consumed
 * directly by the UI, which formats the string itself.
 */

/** Emitted to `auction:<id>` after a bid commits. Contains NO PII. */
export const bidPlacedEventSchema = z.object({
  auctionId: z.string(),
  amount: z.number(),
  bidderDisplayName: z.string(),
  highestBid: z.number(),
  bidCount: z.number(),
  endAt: z.string(),
});
export type BidPlacedEvent = z.infer<typeof bidPlacedEventSchema>;

/** Emitted to `auction:<id>` when anti-snipe extends the deadline. */
export const auctionExtendedEventSchema = z.object({
  auctionId: z.string(),
  endAt: z.string(),
});
export type AuctionExtendedEvent = z.infer<typeof auctionExtendedEventSchema>;

/** Emitted to `auction:<id>` when the auction closes. */
export const auctionClosedEventSchema = z.object({
  auctionId: z.string(),
  winnerId: z.string().nullable(),
  finalAmount: z.number().nullable(),
});
export type AuctionClosedEvent = z.infer<typeof auctionClosedEventSchema>;

/** User-scoped realtime event pushed to the owner's socket (event: "notification"). */
export const userNotificationEventSchema = z.object({
  type: notificationTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type UserNotificationEvent = z.infer<typeof userNotificationEventSchema>;

/** Client → server message to (un)subscribe from an auction room. */
export const joinAuctionMessageSchema = z.object({ auctionId: z.string() });
export type JoinAuctionMessage = z.infer<typeof joinAuctionMessageSchema>;

/** Event name → payload type. Server emits these; clients listen for them. */
export interface ServerToClientEventMap {
  "bid:placed": BidPlacedEvent;
  "auction:extended": AuctionExtendedEvent;
  "auction:closed": AuctionClosedEvent;
  notification: UserNotificationEvent;
}

/** Event name → payload type. Clients emit these; the server listens for them. */
export interface ClientToServerEventMap {
  join: JoinAuctionMessage;
  leave: JoinAuctionMessage;
}
