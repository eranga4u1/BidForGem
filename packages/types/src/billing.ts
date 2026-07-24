import { z } from "zod";

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code"),
  );

/**
 * The stored shape of the app_settings 'posting_fee' row (jsonb). `free_until`
 * is coerced from an ISO string to a Date on read.
 */
export const postingFeeValueSchema = z.object({
  enabled: z.boolean(),
  amount: z.number().int().nonnegative(),
  currency,
  free_until: z.union([z.coerce.date(), z.null()]).default(null),
  free_quota: z.number().int().nonnegative().default(0),
});
export type PostingFeeSettings = z.infer<typeof postingFeeValueSchema>;

/** Admin update payload — `free_until` is an ISO datetime string (or null). */
export const postingFeeUpdateInputSchema = z.object({
  enabled: z.boolean(),
  amount: z.number().int().nonnegative(),
  currency,
  free_until: z.union([z.string().datetime(), z.null()]).default(null),
  free_quota: z.number().int().nonnegative().default(0),
});
export type PostingFeeUpdateInput = z.infer<typeof postingFeeUpdateInputSchema>;

/** Result of resolving the posting fee for a specific user's publish attempt. */
export const postingFeeSchema = z.object({
  required: z.boolean(),
  amount: z.number().int().nonnegative(),
  currency: z.string(),
});
export type PostingFee = z.infer<typeof postingFeeSchema>;
