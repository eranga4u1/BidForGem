import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { media } from "../db/schema.js";
import { insertGem, insertUser, makeTestDb, type AnyDb } from "../test/harness.js";
import { createMemoryStorage, type MemoryStorage } from "../storage/memory-provider.js";
import { createGemsService } from "./gems-service.js";
import { createMediaService, type MediaService } from "./media-service.js";

const PHOTO = { type: "photo" as const, mime: "image/jpeg", sizeBytes: 1_000_000 };

describe("MediaService", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let storage: MemoryStorage;
  let service: MediaService;
  let sellerId: string;
  let otherId: string;
  let gemId: string;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    storage = createMemoryStorage();
    service = createMediaService({ db, storage });
    sellerId = (await insertUser(db, { name: "Seller" })).id;
    otherId = (await insertUser(db, { name: "Other" })).id;
    gemId = (await insertGem(db, sellerId, { status: "active" })).id;
  });

  afterEach(async () => {
    await close();
  });

  describe("requestUpload validation", () => {
    it("rejects a disallowed mime type", async () => {
      const res = await service.requestUpload(sellerId, gemId, { ...PHOTO, mime: "image/gif" });
      expect(res).toEqual({ ok: false, reason: "UNSUPPORTED_MEDIA_TYPE" });
    });

    it("rejects an oversized file", async () => {
      const res = await service.requestUpload(sellerId, gemId, {
        ...PHOTO,
        sizeBytes: 11 * 1024 * 1024,
      });
      expect(res).toEqual({ ok: false, reason: "FILE_TOO_LARGE" });
    });

    it("rejects a non-owner", async () => {
      const res = await service.requestUpload(otherId, gemId, PHOTO);
      expect(res).toEqual({ ok: false, reason: "FORBIDDEN" });
    });
  });

  describe("upload lifecycle", () => {
    it("creates a pending row, returns a PUT ticket, and complete flips it to ready", async () => {
      const res = await service.requestUpload(sellerId, gemId, PHOTO);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.ticket.method).toBe("PUT");
      expect(res.ticket.headers["content-type"]).toBe("image/jpeg");

      const [pending] = await db.select().from(media).where(eq(media.id, res.ticket.mediaId));
      expect(pending?.status).toBe("pending");
      expect(pending?.url).toBeNull();

      const done = await service.completeUpload(sellerId, gemId, res.ticket.mediaId);
      expect(done.ok).toBe(true);
      if (done.ok) {
        expect(done.media.status).toBe("ready");
        expect(done.media.url).toContain("cdn.gem.test"); // public CDN url
      }
    });

    it("never returns pending media in a gem's listing; ready media appears", async () => {
      const gems = createGemsService({ db });
      const res = await service.requestUpload(sellerId, gemId, PHOTO);
      if (!res.ok) throw new Error("upload req failed");

      const beforeComplete = await gems.get(sellerId, gemId);
      expect(beforeComplete.ok && beforeComplete.gem.media.length).toBe(0);

      await service.completeUpload(sellerId, gemId, res.ticket.mediaId);
      const afterComplete = await gems.get(sellerId, gemId);
      expect(afterComplete.ok && afterComplete.gem.media.length).toBe(1);
    });
  });

  describe("storage key safety", () => {
    it("generates the key from server ids, ignoring a malicious client filename", async () => {
      const res = await service.requestUpload(sellerId, gemId, {
        ...PHOTO,
        filename: "../../../etc/passwd.jpg",
      });
      if (!res.ok) throw new Error("upload req failed");
      const [row] = await db.select().from(media).where(eq(media.id, res.ticket.mediaId));
      expect(row?.storageKey).toBe(`gems/${gemId}/media/${res.ticket.mediaId}`);
      expect(row?.storageKey).not.toContain("passwd");
      expect(row?.storageKey).not.toContain("..");
    });
  });

  describe("per-gem media limits", () => {
    it("enforces the max photo count (12)", async () => {
      for (let i = 0; i < 12; i++) {
        const ok = await service.requestUpload(sellerId, gemId, PHOTO);
        expect(ok.ok).toBe(true);
      }
      const thirteenth = await service.requestUpload(sellerId, gemId, PHOTO);
      expect(thirteenth).toEqual({ ok: false, reason: "MEDIA_LIMIT_REACHED" });
    });
  });

  describe("certificate access control", () => {
    const CERT = { type: "certificate" as const, mime: "application/pdf", sizeBytes: 500_000 };

    it("certificates are never publicly reachable (url stays null after complete)", async () => {
      const req = await service.requestUpload(sellerId, gemId, CERT);
      if (!req.ok) throw new Error("cert upload req failed");
      const done = await service.completeUpload(sellerId, gemId, req.ticket.mediaId);
      expect(done.ok && done.media.url).toBeNull();
      // The stored key lives under the private certificate prefix.
      const [row] = await db.select().from(media).where(eq(media.id, req.ticket.mediaId));
      expect(row?.storageKey.startsWith("certificates/")).toBe(true);
    });

    it("certificate read URL requires auth and is short-lived (~5 min)", async () => {
      const fixedNow = new Date("2026-07-23T00:00:00.000Z");
      const svc = createMediaService({ db, storage, now: () => fixedNow });
      const req = await svc.requestUpload(sellerId, gemId, CERT);
      if (!req.ok) throw new Error("cert upload req failed");
      await svc.completeUpload(sellerId, gemId, req.ticket.mediaId);

      // Anonymous access is rejected.
      const anon = await svc.getReadUrl(null, gemId, req.ticket.mediaId);
      expect(anon).toEqual({ ok: false, reason: "UNAUTHORIZED" });

      // Authenticated access returns a signed URL expiring in 5 minutes.
      const authed = await svc.getReadUrl(otherId, gemId, req.ticket.mediaId);
      expect(authed.ok).toBe(true);
      if (authed.ok) {
        expect(authed.url).toContain("signed/");
        expect(authed.expiresAt?.getTime()).toBe(fixedNow.getTime() + 300_000);
      }
    });

    it("does not serve pending media via read URL", async () => {
      const req = await service.requestUpload(sellerId, gemId, CERT);
      if (!req.ok) throw new Error("cert upload req failed");
      // Not completed yet -> pending -> not found.
      const res = await service.getReadUrl(sellerId, gemId, req.ticket.mediaId);
      expect(res).toEqual({ ok: false, reason: "NOT_FOUND" });
    });
  });

  describe("delete", () => {
    it("removes the media row and object; non-owner is rejected", async () => {
      const req = await service.requestUpload(sellerId, gemId, PHOTO);
      if (!req.ok) throw new Error("upload req failed");
      await service.completeUpload(sellerId, gemId, req.ticket.mediaId);

      expect(await service.deleteMedia(otherId, gemId, req.ticket.mediaId)).toEqual({
        ok: false,
        reason: "FORBIDDEN",
      });

      expect((await service.deleteMedia(sellerId, gemId, req.ticket.mediaId)).ok).toBe(true);
      const rows = await db.select().from(media).where(eq(media.id, req.ticket.mediaId));
      expect(rows).toHaveLength(0);
    });
  });
});
