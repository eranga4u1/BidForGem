import { formatMoney as formatMinorUnits } from "@gem/contracts";

/** A monetary amount in minor units (cents) plus its ISO currency code. */
export interface Money {
  amount: number;
  currency: string;
}

/**
 * Format `Money` for display using the shared formatter web and mobile also
 * use, e.g. { amount: 150000, currency: "LKR" } -> "Rs. 1,500".
 */
export function formatMoney({ amount, currency }: Money): string {
  return formatMinorUnits(amount, currency);
}
