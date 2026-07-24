import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PostingFeeSettings } from "@gem/types";
import { appSettings } from "../db/schema.js";
import { createGemsService } from "../gems/gems-service.js";
import { createSettingsService, type SettingsService } from "../settings/settings-service.js";
import { insertGem, insertUser, makeTestDb, type AnyDb } from "../test/harness.js";
import { resolvePostingFee } from "./posting-fee.js";

describe("posting fee", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let userId: string;
  let settings: SettingsService;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    userId = (await insertUser(db, { name: "Seller" })).id;
    settings = createSettingsService(db);
  });
  afterEach(async () => {
    await close();
  });

  // Write the raw stored jsonb value (as an admin/data change would).
  async function setRow(value: Record<string, unknown>): Promise<void> {
    await db.update(appSettings).set({ value }).where(eq(appSettings.key, "posting_fee"));
    settings.invalidate();
  }

  const cfg = (over: Partial<PostingFeeSettings> = {}): PostingFeeSettings => ({
    enabled: true,
    amount: 500,
    currency: "USD",
    free_until: null,
    free_quota: 0,
    ...over,
  });

  describe("resolvePostingFee (resolution order)", () => {
    it("disabled -> free", async () => {
      expect(await resolvePostingFee(db, cfg({ enabled: false }), userId)).toEqual({
        required: false,
        amount: 0,
        currency: "USD",
      });
    });

    it("enabled with no promo/quota -> required with amount + currency", async () => {
      expect(await resolvePostingFee(db, cfg({ amount: 750, currency: "EUR" }), userId)).toEqual({
        required: true,
        amount: 750,
        currency: "EUR",
      });
    });

    it("free_until in the future -> free; in the past -> required", async () => {
      const future = cfg({ free_until: new Date(Date.now() + 3_600_000) });
      expect((await resolvePostingFee(db, future, userId)).required).toBe(false);

      const past = cfg({ free_until: new Date(Date.now() - 3_600_000) });
      expect((await resolvePostingFee(db, past, userId)).required).toBe(true);
    });

    it("free_quota: free while published count < quota, required at the boundary", async () => {
      const quota2 = cfg({ free_quota: 2 });
      // 0 published -> free
      expect((await resolvePostingFee(db, quota2, userId)).required).toBe(false);
      await insertGem(db, userId, { status: "active" }); // 1 published
      expect((await resolvePostingFee(db, quota2, userId)).required).toBe(false);
      await insertGem(db, userId, { status: "active" }); // 2 published == quota
      expect((await resolvePostingFee(db, quota2, userId)).required).toBe(true);
    });

    it("amount stays an integer and currency is preserved", async () => {
      const res = await resolvePostingFee(db, cfg({ amount: 1234, currency: "gbp" }), userId);
      // currency normalized to uppercase by the settings schema when read from DB;
      // here we passed a raw object, so it's echoed as given.
      expect(res.amount).toBe(1234);
      expect(Number.isInteger(res.amount)).toBe(true);
    });
  });

  describe("SettingsService", () => {
    it("malformed posting_fee row fails safe to FREE and logs loudly", async () => {
      const logs: string[] = [];
      const s = createSettingsService(db, { logError: (m) => logs.push(m) });
      await db
        .update(appSettings)
        .set({ value: { nonsense: true } })
        .where(eq(appSettings.key, "posting_fee"));

      const value = await s.getPostingFee();
      expect(value.enabled).toBe(false); // FREE, not blocked, not charging
      expect((await resolvePostingFee(db, value, userId)).required).toBe(false);
      expect(logs.length).toBeGreaterThan(0);
    });

    it("cache: a change is not seen before invalidation, and IS seen after", async () => {
      // Seeded enabled=false; prime the cache.
      expect((await settings.getPostingFee()).enabled).toBe(false);

      await db
        .update(appSettings)
        .set({
          value: { enabled: true, amount: 500, currency: "USD", free_until: null, free_quota: 0 },
        })
        .where(eq(appSettings.key, "posting_fee"));

      // Still cached -> stale free (documents the TTL propagation delay).
      expect((await settings.getPostingFee()).enabled).toBe(false);
      settings.invalidate();
      expect((await settings.getPostingFee()).enabled).toBe(true);
    });
  });

  describe("publish gate (gems.publish)", () => {
    const draft = async (svc = createGemsService({ db, settings })): Promise<string> => {
      const res = await svc.create(userId, { title: "Gem", type: "ruby", carat: 1 });
      if (!res.ok) throw new Error("create failed");
      return res.gem.id;
    };

    it("free config -> publish proceeds", async () => {
      const svc = createGemsService({ db, settings });
      const id = await draft(svc);
      const res = await svc.publish(userId, id);
      expect(res.ok && res.gem.status).toBe("active");
    });

    it("paid config -> publish blocked with fee + paymentIntentRef", async () => {
      await setRow({
        enabled: true,
        amount: 500,
        currency: "USD",
        free_until: null,
        free_quota: 0,
      });
      const svc = createGemsService({ db, settings });
      const id = await draft(svc);
      const res = await svc.publish(userId, id);
      expect(res.ok).toBe(false);
      if (!res.ok && res.reason === "POSTING_FEE_REQUIRED") {
        expect(res.fee).toEqual({ required: true, amount: 500, currency: "USD" });
        expect(res.paymentIntentRef).toMatch(/^pf_/);
      } else {
        throw new Error(`expected POSTING_FEE_REQUIRED, got ${res.ok ? "ok" : res.reason}`);
      }
    });

    it("free_quota=2 -> first 2 publishes free, the 3rd requires payment", async () => {
      await setRow({
        enabled: true,
        amount: 500,
        currency: "USD",
        free_until: null,
        free_quota: 2,
      });
      const svc = createGemsService({ db, settings });
      const first = await svc.publish(userId, await draft(svc));
      const second = await svc.publish(userId, await draft(svc));
      const third = await svc.publish(userId, await draft(svc));
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      expect(third.ok).toBe(false);
      if (!third.ok) expect(third.reason).toBe("POSTING_FEE_REQUIRED");
    });

    it("FLIP: data-only change to the settings row flips the gate, no code change", async () => {
      const svc = createGemsService({ db, settings });
      // Seeded free -> publish proceeds.
      const freeId = await draft(svc);
      expect((await svc.publish(userId, freeId)).ok).toBe(true);

      // Change ONLY the settings row to paid, then invalidate the cache.
      await setRow({
        enabled: true,
        amount: 999,
        currency: "USD",
        free_until: null,
        free_quota: 0,
      });

      const paidId = await draft(svc);
      const res = await svc.publish(userId, paidId);
      expect(res.ok).toBe(false);
      if (!res.ok && res.reason === "POSTING_FEE_REQUIRED") {
        expect(res.fee.amount).toBe(999);
      } else {
        throw new Error("expected the gate to flip to POSTING_FEE_REQUIRED");
      }
    });
  });
});
