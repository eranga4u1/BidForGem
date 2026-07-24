import { Inject, Injectable } from "@nestjs/common";
import { closeAuction, type CloseAuctionResult } from "../../auctions/close-auction.js";
import type { Db } from "../../gems/access.js";
import type { NotificationDispatcher } from "../../notifications/dispatcher.js";
import { DB, NOTIFICATION_DISPATCHER } from "../tokens.js";

/**
 * Bridges the framework-free `closeAuction` transaction to real-time delivery:
 * close in one transaction, then (AFTER commit) broadcast `auction:closed` and
 * push the user-scoped AUCTION_WON event. The scheduler calls this per auction.
 */
@Injectable()
export class AuctionCloserService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: NotificationDispatcher,
  ) {}

  async close(auctionId: string): Promise<CloseAuctionResult> {
    const result = await closeAuction(this.db, auctionId);
    if (!result.ok) return result;

    this.dispatcher.auctionClosed({
      auctionId,
      winnerId: result.winnerId,
      finalAmount: result.finalAmount,
    });
    for (const n of result.notifications) {
      if (n.type === "AUCTION_WON") {
        this.dispatcher.userNotification(n.userId, {
          type: n.type,
          payload: n.payload,
          createdAt: n.createdAt.toISOString(),
        });
      }
    }
    return result;
  }
}
