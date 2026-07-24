import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import {
  caratMilliFromCarat,
  createGemInputSchema,
  gemFilterSchema,
  updateGemInputSchema,
  type PostingFee,
  type PublicGem,
} from "@gem/types";
import type { ZodError } from "zod";
import { resolvePostingFee } from "../billing/posting-fee.js";
import { gems, media, type Gem } from "../db/schema.js";
import type { SettingsService } from "../settings/settings-service.js";
import { isDeleted, isGemLocked, loadGem, readyMedia, type Db } from "./access.js";
import { toPublicGem } from "./mappers.js";

type Issues = ZodError["issues"];

export type CreateGemResult =
  { ok: true; gem: PublicGem } | { ok: false; reason: "INVALID_INPUT"; issues: Issues };

export type GetGemResult = { ok: true; gem: PublicGem } | { ok: false; reason: "NOT_FOUND" };

export type UpdateGemResult =
  | { ok: true; gem: PublicGem }
  | { ok: false; reason: "INVALID_INPUT"; issues: Issues }
  | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN" | "GEM_NOT_EDITABLE" };

export type DeleteGemResult =
  { ok: true } | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN" | "GEM_NOT_EDITABLE" };

export type PublishGemResult =
  | { ok: true; gem: PublicGem }
  | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN" | "GEM_NOT_DRAFT" }
  | { ok: false; reason: "POSTING_FEE_REQUIRED"; fee: PostingFee; paymentIntentRef: string };

export type ListGemsResult =
  | { ok: true; items: PublicGem[]; limit: number; offset: number }
  | { ok: false; reason: "INVALID_INPUT"; issues: Issues };

export interface GemsService {
  create(sellerId: string, input: unknown): Promise<CreateGemResult>;
  get(viewerId: string | null, gemId: string): Promise<GetGemResult>;
  update(sellerId: string, gemId: string, input: unknown): Promise<UpdateGemResult>;
  remove(sellerId: string, gemId: string): Promise<DeleteGemResult>;
  publish(sellerId: string, gemId: string): Promise<PublishGemResult>;
  list(viewerId: string | null, filters: unknown): Promise<ListGemsResult>;
}

export interface GemsServiceDeps {
  db: Db;
  now?: () => Date;
  /** When provided, publish is gated on the posting fee. Absent = always free. */
  settings?: SettingsService;
}

export function createGemsService(deps: GemsServiceDeps): GemsService {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  /** A gem is visible if it exists, is not deleted, and (if draft) owned by viewer. */
  function visibleTo(gem: Gem, viewerId: string | null): boolean {
    if (isDeleted(gem)) return false;
    if (gem.status === "draft") return gem.sellerId === viewerId;
    return true;
  }

  return {
    async create(sellerId, rawInput) {
      const parsed = createGemInputSchema.safeParse(rawInput);
      if (!parsed.success)
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      const input = parsed.data;

      const [row] = await db
        .insert(gems)
        .values({
          sellerId,
          title: input.title,
          description: input.description ?? null,
          type: input.type,
          caratMilli: caratMilliFromCarat(input.carat),
          color: input.color ?? null,
          clarity: input.clarity ?? null,
          cut: input.cut ?? null,
          origin: input.origin ?? null,
        })
        .returning();
      if (!row) throw new Error("Gem insert returned no row");
      return { ok: true, gem: toPublicGem(row, []) };
    },

    async get(viewerId, gemId) {
      const gem = await loadGem(db, gemId);
      if (!gem || !visibleTo(gem, viewerId)) return { ok: false, reason: "NOT_FOUND" };
      const mediaRows = await readyMedia(db, gemId);
      return { ok: true, gem: toPublicGem(gem, mediaRows) };
    },

    async update(sellerId, gemId, rawInput) {
      const parsed = updateGemInputSchema.safeParse(rawInput);
      if (!parsed.success)
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      const input = parsed.data;

      const gem = await loadGem(db, gemId);
      if (!gem || isDeleted(gem)) return { ok: false, reason: "NOT_FOUND" };
      if (gem.sellerId !== sellerId) return { ok: false, reason: "FORBIDDEN" };
      if (await isGemLocked(db, gemId)) return { ok: false, reason: "GEM_NOT_EDITABLE" };

      const patch: Partial<typeof gems.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.type !== undefined) patch.type = input.type;
      if (input.carat !== undefined) patch.caratMilli = caratMilliFromCarat(input.carat);
      if (input.color !== undefined) patch.color = input.color;
      if (input.clarity !== undefined) patch.clarity = input.clarity;
      if (input.cut !== undefined) patch.cut = input.cut;
      if (input.origin !== undefined) patch.origin = input.origin;

      const [updated] =
        Object.keys(patch).length > 0
          ? await db.update(gems).set(patch).where(eq(gems.id, gemId)).returning()
          : [gem];
      if (!updated) throw new Error("Gem update returned no row");
      const mediaRows = await readyMedia(db, gemId);
      return { ok: true, gem: toPublicGem(updated, mediaRows) };
    },

    async remove(sellerId, gemId) {
      const gem = await loadGem(db, gemId);
      if (!gem || isDeleted(gem)) return { ok: false, reason: "NOT_FOUND" };
      if (gem.sellerId !== sellerId) return { ok: false, reason: "FORBIDDEN" };
      if (await isGemLocked(db, gemId)) return { ok: false, reason: "GEM_NOT_EDITABLE" };

      // Soft-delete: never hard-delete a gem that auctions/bids may reference.
      await db.update(gems).set({ deletedAt: now() }).where(eq(gems.id, gemId));
      return { ok: true };
    },

    async publish(sellerId, gemId) {
      const gem = await loadGem(db, gemId);
      if (!gem || isDeleted(gem)) return { ok: false, reason: "NOT_FOUND" };
      if (gem.sellerId !== sellerId) return { ok: false, reason: "FORBIDDEN" };
      if (gem.status !== "draft") return { ok: false, reason: "GEM_NOT_DRAFT" };

      // Posting-fee gate at the point of going public. Flipping free<->paid is a
      // pure data change to app_settings — no code change here.
      if (deps.settings) {
        const config = await deps.settings.getPostingFee();
        const fee = await resolvePostingFee(db, config, sellerId);
        if (fee.required) {
          return {
            ok: false,
            reason: "POSTING_FEE_REQUIRED",
            fee,
            paymentIntentRef: `pf_${randomUUID()}`,
          };
        }
      }

      const [updated] = await db
        .update(gems)
        .set({ status: "active" })
        .where(eq(gems.id, gemId))
        .returning();
      if (!updated) throw new Error("Gem publish returned no row");
      const mediaRows = await readyMedia(db, gemId);
      return { ok: true, gem: toPublicGem(updated, mediaRows) };
    },

    async list(viewerId, rawFilters) {
      const parsed = gemFilterSchema.safeParse(rawFilters ?? {});
      if (!parsed.success)
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      const f = parsed.data;

      const conditions = [isNull(gems.deletedAt), ne(gems.status, "draft")];
      if (f.status && f.status !== "draft") conditions.push(eq(gems.status, f.status));
      if (f.type) conditions.push(eq(gems.type, f.type));
      if (f.color) conditions.push(eq(gems.color, f.color));
      if (f.clarity) conditions.push(eq(gems.clarity, f.clarity));
      if (f.cut) conditions.push(eq(gems.cut, f.cut));
      if (f.origin) conditions.push(eq(gems.origin, f.origin));
      if (f.caratMin !== undefined)
        conditions.push(gte(gems.caratMilli, caratMilliFromCarat(f.caratMin)));
      if (f.caratMax !== undefined)
        conditions.push(lte(gems.caratMilli, caratMilliFromCarat(f.caratMax)));

      const rows = await db
        .select()
        .from(gems)
        .where(and(...conditions))
        .orderBy(desc(gems.createdAt))
        .limit(f.limit)
        .offset(f.offset);

      // Attach ready media for the page in one query, grouped by gem.
      const ids = rows.map((r) => r.id);
      const mediaByGem = new Map<string, (typeof media.$inferSelect)[]>();
      if (ids.length > 0) {
        const mediaRows = await db
          .select()
          .from(media)
          .where(and(inArray(media.gemId, ids), eq(media.status, "ready")));
        for (const m of mediaRows) {
          const list = mediaByGem.get(m.gemId) ?? [];
          list.push(m);
          mediaByGem.set(m.gemId, list);
        }
      }

      const items = rows.map((r) => toPublicGem(r, mediaByGem.get(r.id) ?? []));
      // `viewerId` reserved for future per-viewer visibility; drafts already excluded.
      void viewerId;
      return { ok: true, items, limit: f.limit, offset: f.offset };
    },
  };
}
