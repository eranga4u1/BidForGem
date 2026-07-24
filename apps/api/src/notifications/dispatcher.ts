import type { AuctionClosedEvent, UserNotificationEvent } from "@gem/types";

/**
 * Post-commit delivery of real-time notifications. In-app (socket) is the only
 * implementation for now; email/push can be added as additional dispatchers
 * later WITHOUT touching close logic — closeAuction/placeBid persist the durable
 * rows, and callers hand the delivery to a dispatcher after the commit.
 */
export interface NotificationDispatcher {
  auctionClosed(event: AuctionClosedEvent): void;
  userNotification(userId: string, event: UserNotificationEvent): void;
}

/** No-op dispatcher for contexts without real-time delivery (some tests). */
export const noopNotificationDispatcher: NotificationDispatcher = {
  auctionClosed() {},
  userNotification() {},
};
