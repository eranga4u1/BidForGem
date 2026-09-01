/** Format integer minor units (cents) as a currency string. */
export function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** ms remaining -> compact "3d" / "5h" / "12m" / "45s" for at-a-glance urgency. */
export function formatEndsIn(ms: number): string {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  if (s >= 86400) return `${Math.floor(s / 86400)}d`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return `${s}s`;
}

/** true when the auction ends within the given window (default 1h) — drives urgency styling. */
export function isEndingSoon(endAt: Date, withinMs = 3600_000): boolean {
  const remaining = endAt.getTime() - Date.now();
  return remaining > 0 && remaining <= withinMs;
}

/** A past Date -> "just now" / "3m ago" / "2h ago" / "5d ago". */
export function formatRelative(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** ms remaining -> HH:MM:SS (or Nd HH:MM:SS). */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  const hms = `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return days > 0 ? `${days}d ${hms}` : hms;
}
