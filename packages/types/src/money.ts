import { z } from "zod";

/**
 * Money is ALWAYS represented as an integer number of minor units (e.g. cents).
 * Never use floating point for money. This branded type makes accidental use of a
 * raw `number` (which might be a float / major unit) a compile-time error.
 */
export type MinorUnits = number & { readonly __brand: "MinorUnits" };

/** ISO-4217 currency code (validated as a 3-letter uppercase string). */
export const currencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO-4217 code");

export type Currency = z.infer<typeof currencySchema>;

/** A monetary amount: integer minor units plus a currency. */
export const moneySchema = z.object({
  amount: z.int().nonnegative(),
  currency: currencySchema,
});

export type Money = { amount: MinorUnits; currency: Currency };

/**
 * Construct a validated Money value from an integer minor-unit amount.
 * Throws if the amount is not a non-negative integer.
 */
export function money(amount: number, currency: string): Money {
  const parsed = moneySchema.parse({ amount, currency });
  return {
    amount: parsed.amount as MinorUnits,
    currency: parsed.currency,
  };
}

/** Add two amounts of the same currency. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return { amount: (a.amount + b.amount) as MinorUnits, currency: a.currency };
}
