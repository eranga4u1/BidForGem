import { z } from "zod";
import { auctionStatusSchema } from "./auctions.js";
import { listResponseSchema } from "./envelopes.js";
import { publicGemSchema } from "./gems.js";

/** The signed-in user's standing in an auction they've bid on. */
export const bidOutcomeSchema = z.enum(["leading", "outbid", "won", "lost", "ended"]);
export type BidOutcome = z.infer<typeof bidOutcomeSchema>;

/** One row of "my bids": the user's position in an auction they participated in. */
export const myBidSchema = z.object({
  auctionId: z.uuid(),
  gemId: z.uuid(),
  gemTitle: z.string(),
  photoUrl: z.string().nullable(),
  currency: z.string(),
  /** The highest amount this user has bid on the auction. */
  myMaxBid: z.number().int(),
  /** The auction's current highest bid (may be someone else's). */
  highestBid: z.number().int().nullable(),
  status: auctionStatusSchema,
  endAt: z.coerce.date(),
  lastBidAt: z.coerce.date(),
  outcome: bidOutcomeSchema,
});
export type MyBid = z.infer<typeof myBidSchema>;

/** GET /auctions/my-bids */
export const myBidsResponseSchema = listResponseSchema(myBidSchema);
export type MyBidsResponse = z.infer<typeof myBidsResponseSchema>;

/** A short auction summary attached to one of the seller's gems. */
export const listingAuctionSchema = z.object({
  id: z.uuid(),
  status: auctionStatusSchema,
  currency: z.string(),
  endAt: z.coerce.date(),
  highestBid: z.number().int().nullable(),
  bidCount: z.number().int(),
});
export type ListingAuction = z.infer<typeof listingAuctionSchema>;

/** One row of "my listings": a gem the user owns plus its latest auction (if any). */
export const myListingSchema = z.object({
  gem: publicGemSchema,
  auction: listingAuctionSchema.nullable(),
});
export type MyListing = z.infer<typeof myListingSchema>;

/** GET /gems/mine */
export const myListingsResponseSchema = listResponseSchema(myListingSchema);
export type MyListingsResponse = z.infer<typeof myListingsResponseSchema>;
