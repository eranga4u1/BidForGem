import type { BidHistoryItem, PublicAuction } from "@gem/types";
import type { Auction } from "../db/schema.js";

export function toPublicAuction(row: Auction, bidCount: number): PublicAuction {
  return {
    id: row.id,
    gemId: row.gemId,
    status: row.status,
    currency: row.currency,
    startPrice: row.startPrice,
    reservePrice: row.reservePrice,
    minIncrement: row.minIncrement,
    startAt: row.startAt,
    endAt: row.endAt,
    highestBid: row.highestBid,
    bidCount,
    antiSnipeWindowSeconds: row.antiSnipeWindowSeconds,
    antiSnipeExtendSeconds: row.antiSnipeExtendSeconds,
  };
}

export function toBidHistoryItem(row: {
  id: string;
  amount: number;
  createdAt: Date;
  bidderDisplayName: string;
}): BidHistoryItem {
  return {
    id: row.id,
    amount: row.amount,
    createdAt: row.createdAt,
    bidderDisplayName: row.bidderDisplayName,
  };
}
