import { Inject, Injectable } from "@nestjs/common";
import type { AuctionClosedEvent, UserNotificationEvent } from "@gem/types";
import type { NotificationDispatcher } from "../../notifications/dispatcher.js";
import { EmailNotifier } from "./email-notifier.js";
import { SocketNotificationDispatcher } from "./socket-dispatcher.js";

/**
 * The one dispatcher the app wires. In-app delivery (socket) is unchanged — it
 * delegates to SocketNotificationDispatcher exactly as before — and email is
 * ADDED on top of every user-scoped notification. Email is fire-and-forget so a
 * slow/failed send never blocks or breaks the post-commit in-app delivery.
 */
@Injectable()
export class CompositeNotificationDispatcher implements NotificationDispatcher {
  constructor(
    @Inject(SocketNotificationDispatcher) private readonly socket: SocketNotificationDispatcher,
    @Inject(EmailNotifier) private readonly emailer: EmailNotifier,
  ) {}

  auctionClosed(event: AuctionClosedEvent): void {
    this.socket.auctionClosed(event);
  }

  userNotification(userId: string, event: UserNotificationEvent): void {
    this.socket.userNotification(userId, event);
    void this.emailer.notify(userId, event);
  }
}
