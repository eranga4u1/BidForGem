import { z } from "zod";

export const notificationTypeSchema = z.enum([
  "AUCTION_WON",
  "AUCTION_SOLD",
  "AUCTION_ENDED_NO_SALE",
  "AUCTION_LOST",
  "OUTBID",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const publicNotificationSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  readAt: z.date().nullable(),
  createdAt: z.date(),
});
export type PublicNotification = z.infer<typeof publicNotificationSchema>;

export const notificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

/** User-scoped real-time event pushed to the owner's socket (event: "notification"). */
export interface UserNotificationEvent {
  type: NotificationType;
  payload: Record<string, unknown>;
  createdAt: string;
}
