import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bids, gems } from "../db/schema.js";
import { insertAuction, insertGem, insertUser, makeTestDb, type AnyDb } from "../test/harness.js";
import { createGemsService, type GemsService } from "./gems-service.js";

describe("GemsService", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let service: GemsService;
  let sellerId: string;
  let otherId: string;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    service = createGemsService({ db });
    sellerId = (await insertUser(db, { name: "Seller" })).id;
    otherId = (await insertUser(db, { name: "Other" })).id;
  });

  afterEach(async () => {
    await close();
  });

  const createDraft = async (): Promise<string> => {
    const res = await service.create(sellerId, {
      title: "Blue Sapphire",
      type: "sapphire",
      carat: 2.5,
    });
    if (!res.ok) throw new Error("create failed");
    return res.gem.id;
  };

  describe("create", () => {
    it("creates a draft and converts decimal carats to integer carat_milli", async () => {
      const res = await service.create(sellerId, {
        title: "Ruby",
        type: "ruby",
        carat: 2.5,
        color: "red",
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.gem.status).toBe("draft");
        expect(res.gem.caratMilli).toBe(2500);
        expect(res.gem.carat).toBe(2.5);
      }
    });

    it("rounds fractional carats correctly (1.005 -> 1005)", async () => {
      const res = await service.create(sellerId, { title: "X", type: "diamond", carat: 1.005 });
      expect(res.ok && res.gem.caratMilli).toBe(1005);
    });

    it("rejects invalid input", async () => {
      const res = await service.create(sellerId, { title: "", type: "ruby", carat: -1 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("INVALID_INPUT");
    });
  });

  describe("draft visibility", () => {
    it("hides drafts from other users and anonymous, shows to the seller", async () => {
      const gemId = await createDraft();
      expect((await service.get(otherId, gemId)).ok).toBe(false);
      expect((await service.get(null, gemId)).ok).toBe(false);
      const owner = await service.get(sellerId, gemId);
      expect(owner.ok).toBe(true);
    });
  });

  describe("publish", () => {
    it("moves a draft to active and makes it publicly visible", async () => {
      const gemId = await createDraft();
      const pub = await service.publish(sellerId, gemId);
      expect(pub.ok && pub.gem.status).toBe("active");
      expect((await service.get(otherId, gemId)).ok).toBe(true);
    });

    it("rejects publishing by a non-owner", async () => {
      const gemId = await createDraft();
      expect(await service.publish(otherId, gemId)).toEqual({ ok: false, reason: "FORBIDDEN" });
    });

    it("rejects publishing a gem that is not a draft", async () => {
      const gemId = await createDraft();
      await service.publish(sellerId, gemId);
      expect(await service.publish(sellerId, gemId)).toEqual({
        ok: false,
        reason: "GEM_NOT_DRAFT",
      });
    });
  });

  describe("update & delete ownership", () => {
    it("rejects update and delete by a non-owner", async () => {
      const gemId = await createDraft();
      expect(await service.update(otherId, gemId, { title: "Hacked" })).toEqual({
        ok: false,
        reason: "FORBIDDEN",
      });
      expect(await service.remove(otherId, gemId)).toEqual({ ok: false, reason: "FORBIDDEN" });
    });

    it("updates own gem", async () => {
      const gemId = await createDraft();
      const res = await service.update(sellerId, gemId, { title: "Renamed", carat: 3.25 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.gem.title).toBe("Renamed");
        expect(res.gem.caratMilli).toBe(3250);
      }
    });

    it("soft-deletes: the row remains but is no longer visible", async () => {
      const gemId = await createDraft();
      expect((await service.remove(sellerId, gemId)).ok).toBe(true);
      expect((await service.get(sellerId, gemId)).ok).toBe(false);
      const [row] = await db.select().from(gems).where(eq(gems.id, gemId));
      expect(row?.deletedAt).not.toBeNull();
    });
  });

  describe("locked gems (bids / active auction)", () => {
    it("cannot edit or delete a gem with an active auction", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      await insertAuction(db, gem.id, { status: "active" });
      expect(await service.update(sellerId, gem.id, { title: "Nope" })).toEqual({
        ok: false,
        reason: "GEM_NOT_EDITABLE",
      });
      expect(await service.remove(sellerId, gem.id)).toEqual({
        ok: false,
        reason: "GEM_NOT_EDITABLE",
      });
    });

    it("cannot edit a gem that has any bids", async () => {
      const gem = await insertGem(db, sellerId, { status: "active" });
      const auction = await insertAuction(db, gem.id, { status: "closed" });
      const bidder = await insertUser(db);
      await db.insert(bids).values({ auctionId: auction.id, bidderId: bidder.id, amount: 5000 });
      expect(await service.update(sellerId, gem.id, { title: "Nope" })).toEqual({
        ok: false,
        reason: "GEM_NOT_EDITABLE",
      });
    });
  });

  describe("list", () => {
    it("returns active gems, excludes drafts, and filters by type + carat range", async () => {
      // Two published gems of different types/carats, plus a draft.
      const a = await service.create(sellerId, { title: "A", type: "ruby", carat: 1 });
      const b = await service.create(sellerId, { title: "B", type: "sapphire", carat: 5 });
      if (!a.ok || !b.ok) throw new Error("setup failed");
      await service.publish(sellerId, a.gem.id);
      await service.publish(sellerId, b.gem.id);
      await createDraft(); // stays draft

      const all = await service.list(null, {});
      expect(all.ok && all.items.length).toBe(2);

      const rubies = await service.list(null, { type: "ruby" });
      expect(rubies.ok && rubies.items.map((g) => g.title)).toEqual(["A"]);

      const big = await service.list(null, { caratMin: 3 });
      expect(big.ok && big.items.map((g) => g.title)).toEqual(["B"]);
    });
  });
});
