/** A monetary amount in minor units (cents) plus its ISO currency code. */
export interface Money {
  amount: number;
  currency: string;
}

/** Format `Money` for display, e.g. { amount: 420000, currency: "USD" } -> "US$4,200.00". */
export function formatMoney({ amount, currency }: Money): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}
