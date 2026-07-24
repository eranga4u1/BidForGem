import { and, desc, eq, isNull } from "drizzle-orm";
import { notificationsQuerySchema, type PublicNotification } from "@gem/types";
import type { ZodError } from "zod";
import { notifications } from "../db/schema.js";
import type { Db } from "../gems/access.js";
import { toPublicNotification } from "./mappers.js";

type Issues = ZodError["issues"];

export type ListNotificationsResult =
  | { ok: true; items: PublicNotification[]; limit: number; offset: number }
  | { ok: false; reason: "INVALID_INPUT"; issues: Issues };

export type MarkReadResult = { ok: true } | { ok: false; reason: "NOT_FOUND" };

export interface NotificationsService {
  list(userId: string, query: unknown): Promise<ListNotificationsResult>;
  markRead(userId: string, id: string): Promise<MarkReadResult>;
  markAllRead(userId: string): Promise<{ ok: true; updated: number }>;
}

export interface NotificationsServiceDeps {
  db: Db;
  now?: () => Date;
}

export function createNotificationsService(deps: NotificationsServiceDeps): NotificationsService {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async list(userId, rawQuery) {
      const parsed = notificationsQuerySchema.safeParse(rawQuery ?? {});
      if (!parsed.success) {
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      }
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(parsed.data.limit)
        .offset(parsed.data.offset);
      return {
        ok: true,
        items: rows.map(toPublicNotification),
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      };
    },

    async markRead(userId, id) {
      // Scoped to the caller's own rows — another user's id simply won't match.
      const updated = await db
        .update(notifications)
        .set({ readAt: now() })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
          ),
        )
        .returning({ id: notifications.id });

      if (updated.length === 0) {
        const [own] = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
          .limit(1);
        if (!own) return { ok: false, reason: "NOT_FOUND" };
        // Own row already read — idempotent success.
      }
      return { ok: true };
    },

    async markAllRead(userId) {
      const updated = await db
        .update(notifications)
        .set({ readAt: now() })
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
        .returning({ id: notifications.id });
      return { ok: true, updated: updated.length };
    },
  };
}
