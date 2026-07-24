import { eq } from "drizzle-orm";
import {
  postingFeeUpdateInputSchema,
  postingFeeValueSchema,
  type PostingFeeSettings,
} from "@gem/types";
import type { ZodError } from "zod";
import { appSettings } from "../db/schema.js";
import type { Db } from "../gems/access.js";

const POSTING_FEE_KEY = "posting_fee";

/**
 * Fail-safe default: FREE. A missing or malformed settings row must NEVER block
 * listings and must NEVER default to charging.
 */
const FREE_SAFE: PostingFeeSettings = {
  enabled: false,
  amount: 0,
  currency: "USD",
  free_until: null,
  free_quota: 0,
};

export type UpdatePostingFeeResult =
  | { ok: true; settings: PostingFeeSettings }
  | { ok: false; reason: "INVALID_INPUT"; issues: ZodError["issues"] };

export interface SettingsService {
  /** Cached read of the posting-fee settings (fail-safe to FREE). */
  getPostingFee(): Promise<PostingFeeSettings>;
  /** Validate + persist a new posting-fee row and invalidate the cache. */
  updatePostingFee(input: unknown, updatedBy: string): Promise<UpdatePostingFeeResult>;
  /** Drop the cache so the next read hits the database. */
  invalidate(): void;
}

export interface SettingsServiceOptions {
  /** Cache TTL in ms (short — this is why data changes propagate without deploy). */
  ttlMs?: number;
  now?: () => number;
  /** Loud logger for malformed config; defaults to console.error. */
  logError?: (message: string, detail?: unknown) => void;
}

export function createSettingsService(
  db: Db,
  options: SettingsServiceOptions = {},
): SettingsService {
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? (() => Date.now());
  const logError = options.logError ?? ((m, d) => console.error(m, d));

  let cache: { value: PostingFeeSettings; expiresAt: number } | null = null;

  async function readFromDb(): Promise<PostingFeeSettings> {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, POSTING_FEE_KEY))
      .limit(1);

    if (!row) {
      logError(`[settings] posting_fee row missing — failing safe to FREE.`);
      return FREE_SAFE;
    }
    const parsed = postingFeeValueSchema.safeParse(row.value);
    if (!parsed.success) {
      logError(
        `[settings] posting_fee row is malformed — failing safe to FREE.`,
        parsed.error.issues,
      );
      return FREE_SAFE;
    }
    return parsed.data;
  }

  const service: SettingsService = {
    async getPostingFee() {
      if (cache && now() < cache.expiresAt) return cache.value;
      const value = await readFromDb();
      cache = { value, expiresAt: now() + ttlMs };
      return value;
    },

    async updatePostingFee(rawInput, updatedBy) {
      const parsed = postingFeeUpdateInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      }
      await db
        .update(appSettings)
        .set({ value: parsed.data, updatedBy, updatedAt: new Date() })
        .where(eq(appSettings.key, POSTING_FEE_KEY));
      service.invalidate();
      return { ok: true, settings: await service.getPostingFee() };
    },

    invalidate() {
      cache = null;
    },
  };
  return service;
}
