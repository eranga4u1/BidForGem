/** Format integer minor units as a currency string. */
export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export interface Remaining {
  ended: boolean;
  label: string;
}

/** Human countdown from now to a target time. */
export function remainingUntil(endAt: Date, now: number = Date.now()): Remaining {
  const ms = endAt.getTime() - now;
  if (ms <= 0) return { ended: true, label: "Ended" };
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number): string => n.toString().padStart(2, "0");
  if (days > 0) return { ended: false, label: `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}` };
  return { ended: false, label: `${pad(hours)}:${pad(mins)}:${pad(secs)}` };
}
