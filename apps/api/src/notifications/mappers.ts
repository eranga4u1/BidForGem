import type { NotificationType, PublicNotification } from "@gem/types";
import type { Notification } from "../db/schema.js";

export function toPublicNotification(row: Notification): PublicNotification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    payload: row.payload,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}
