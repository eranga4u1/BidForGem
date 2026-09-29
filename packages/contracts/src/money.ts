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

/** The marketplace currency: Sri Lankan rupees. New auctions and fees use it. */
export const DEFAULT_CURRENCY = "LKR";

/** Currencies shown with a local symbol instead of Intl's code ("LKR 1,500.00"). */
const LOCAL_SYMBOLS: Readonly<Record<string, string>> = { LKR: "Rs." };

/**
 * Format integer minor units for display — the ONE formatter web, mobile and
 * email share. LKR renders like local listings: "Rs. 1,500" for whole rupees,
 * "Rs. 1,500.50" when there are cents. Other currencies use Intl (en-US).
 */
export function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  const symbol = LOCAL_SYMBOLS[currency];
  if (symbol) {
    const whole = minor % 100 === 0;
    const digits = whole ? 0 : 2;
    const n = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major);
    return `${symbol} ${n}`;
  }
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

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
