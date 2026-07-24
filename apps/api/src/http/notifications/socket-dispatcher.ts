import { Inject, Injectable } from "@nestjs/common";
import type { AuctionClosedEvent, UserNotificationEvent } from "@gem/types";
import type { NotificationDispatcher } from "../../notifications/dispatcher.js";
import { AuctionsGateway } from "../auctions/auctions.gateway.js";

/** In-app (Socket.IO) implementation of the notification dispatcher. */
@Injectable()
export class SocketNotificationDispatcher implements NotificationDispatcher {
  constructor(@Inject(AuctionsGateway) private readonly gateway: AuctionsGateway) {}

  auctionClosed(event: AuctionClosedEvent): void {
    this.gateway.emitAuctionClosed(event);
  }

  userNotification(userId: string, event: UserNotificationEvent): void {
    this.gateway.emitToUser(userId, event);
  }
}
