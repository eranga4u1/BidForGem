import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  MEDIA_LIMITS,
  MEDIA_RULES,
  requestUploadInputSchema,
  type MediaType,
  type PublicMedia,
  type UploadTicket,
} from "@gem/types";
import type { ZodError } from "zod";
import { media } from "../db/schema.js";
import type { StorageProvider, StorageVisibility } from "../storage/provider.js";
import { isDeleted, loadGem, type Db } from "./access.js";
import { toPublicMedia } from "./mappers.js";

type Issues = ZodError["issues"];

/** Presigned upload URLs are valid for 10 minutes. */
const UPLOAD_URL_TTL_SECONDS = 600;
/** Certificate read URLs are short-lived (5 minutes). */
const CERTIFICATE_READ_TTL_SECONDS = 300;

export type RequestUploadResult =
  | { ok: true; ticket: UploadTicket }
  | { ok: false; reason: "INVALID_INPUT"; issues: Issues }
  | {
      ok: false;
      reason:
        | "NOT_FOUND"
        | "FORBIDDEN"
        | "UNSUPPORTED_MEDIA_TYPE"
        | "FILE_TOO_LARGE"
        | "MEDIA_LIMIT_REACHED";
    };

export type CompleteUploadResult =
  { ok: true; media: PublicMedia } | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN" };

export type DeleteMediaResult = { ok: true } | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN" };

export type ReadUrlResult =
  | { ok: true; url: string; expiresAt: Date | null }
  | { ok: false; reason: "NOT_FOUND" | "UNAUTHORIZED" };

export interface MediaService {
  requestUpload(sellerId: string, gemId: string, input: unknown): Promise<RequestUploadResult>;
  completeUpload(sellerId: string, gemId: string, mediaId: string): Promise<CompleteUploadResult>;
  deleteMedia(sellerId: string, gemId: string, mediaId: string): Promise<DeleteMediaResult>;
  getReadUrl(viewerId: string | null, gemId: string, mediaId: string): Promise<ReadUrlResult>;
}

export interface MediaServiceDeps {
  db: Db;
  storage: StorageProvider;
  now?: () => Date;
}

/**
 * Build the object key + visibility for a media item. The key is derived only
 * from server-generated ids (gemId, mediaId) — NEVER from a client filename.
 * Certificates go under a separate private prefix.
 */
function objectFor(
  type: MediaType,
  gemId: string,
  mediaId: string,
): { key: string; visibility: StorageVisibility } {
  if (type === "certificate") {
    return { key: `certificates/${gemId}/${mediaId}`, visibility: "private" };
  }
  return { key: `gems/${gemId}/media/${mediaId}`, visibility: "public" };
}

export function createMediaService(deps: MediaServiceDeps): MediaService {
  const { db, storage } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async requestUpload(sellerId, gemId, rawInput) {
      const parsed = requestUploadInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      }
      const { type, mime, sizeBytes } = parsed.data;

      const gem = await loadGem(db, gemId);
      if (!gem || isDeleted(gem)) return { ok: false, reason: "NOT_FOUND" };
      if (gem.sellerId !== sellerId) return { ok: false, reason: "FORBIDDEN" };

      // Validate mime + size BEFORE issuing a URL.
      const rule = MEDIA_RULES[type];
      if (!rule.mimes.includes(mime)) return { ok: false, reason: "UNSUPPORTED_MEDIA_TYPE" };
      if (sizeBytes > rule.maxBytes) return { ok: false, reason: "FILE_TOO_LARGE" };

      // Enforce per-gem, per-type count limits.
      const existing = await db
        .select({ id: media.id })
        .from(media)
        .where(and(eq(media.gemId, gemId), eq(media.type, type)));
      if (existing.length >= MEDIA_LIMITS[type]) {
        return { ok: false, reason: "MEDIA_LIMIT_REACHED" };
      }

      const mediaId = randomUUID();
      const { key, visibility } = objectFor(type, gemId, mediaId);

      await db.insert(media).values({
        id: mediaId,
        gemId,
        type,
        mime,
        size: sizeBytes,
        storageKey: key,
        status: "pending",
        url: null,
      });

      const target = await storage.getUploadUrl({
        key,
        contentType: mime,
        maxSizeBytes: rule.maxBytes,
        visibility,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      });

      return {
        ok: true,
        ticket: {
          mediaId,
          url: target.url,
          method: target.method,
          headers: target.headers,
          expiresAt: target.expiresAt,
        },
      };
    },

    async completeUpload(sellerId, gemId, mediaId) {
      const gem = await loadGem(db, gemId);
      if (!gem || isDeleted(gem)) return { ok: false, reason: "NOT_FOUND" };
      if (gem.sellerId !== sellerId) return { ok: false, reason: "FORBIDDEN" };

      const [row] = await db
        .select()
        .from(media)
        .where(and(eq(media.id, mediaId), eq(media.gemId, gemId)))
        .limit(1);
      if (!row) return { ok: false, reason: "NOT_FOUND" };

      const { visibility } = objectFor(row.type, gemId, mediaId);
      const publicUrl = storage.publicUrl(row.storageKey, visibility);

      const [updated] = await db
        .update(media)
        .set({ status: "ready", url: publicUrl })
        .where(eq(media.id, mediaId))
        .returning();
      if (!updated) throw new Error("Media update returned no row");
      return { ok: true, media: toPublicMedia(updated) };
    },

    async deleteMedia(sellerId, gemId, mediaId) {
      const gem = await loadGem(db, gemId);
      if (!gem || isDeleted(gem)) return { ok: false, reason: "NOT_FOUND" };
      if (gem.sellerId !== sellerId) return { ok: false, reason: "FORBIDDEN" };

      const [row] = await db
        .select()
        .from(media)
        .where(and(eq(media.id, mediaId), eq(media.gemId, gemId)))
        .limit(1);
      if (!row) return { ok: false, reason: "NOT_FOUND" };

      const { visibility } = objectFor(row.type, gemId, mediaId);
      await storage.delete({ key: row.storageKey, visibility });
      await db.delete(media).where(eq(media.id, mediaId));
      return { ok: true };
    },

    async getReadUrl(viewerId, gemId, mediaId) {
      const gem = await loadGem(db, gemId);
      if (!gem || isDeleted(gem)) return { ok: false, reason: "NOT_FOUND" };
      if (gem.status === "draft" && gem.sellerId !== viewerId) {
        return { ok: false, reason: "NOT_FOUND" };
      }

      const [row] = await db
        .select()
        .from(media)
        .where(and(eq(media.id, mediaId), eq(media.gemId, gemId)))
        .limit(1);
      // Never serve pending media.
      if (!row || row.status !== "ready") return { ok: false, reason: "NOT_FOUND" };

      const { key, visibility } = objectFor(row.type, gemId, mediaId);

      if (row.type === "certificate") {
        // Certificates: authenticated users only, short-lived signed URL.
        if (!viewerId) return { ok: false, reason: "UNAUTHORIZED" };
        const url = await storage.getReadUrl({
          key,
          visibility,
          expiresInSeconds: CERTIFICATE_READ_TTL_SECONDS,
        });
        return {
          ok: true,
          url,
          expiresAt: new Date(now().getTime() + CERTIFICATE_READ_TTL_SECONDS * 1000),
        };
      }

      // Public media: stable CDN URL, no expiry.
      const url = storage.publicUrl(key, visibility) ?? row.url;
      if (!url) return { ok: false, reason: "NOT_FOUND" };
      return { ok: true, url, expiresAt: null };
    },
  };
}
