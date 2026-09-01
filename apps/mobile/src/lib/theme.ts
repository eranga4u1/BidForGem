/** Shared dark "premium gem" palette, mirroring the web app's look. */
export const theme = {
  bg: "#0b0e14",
  /** Slightly elevated surface: inputs, thumbnails, inset wells. */
  bgElev: "#0f1621",
  card: "#141a24",
  cardBorder: "#232c3a",
  /** Hairline used on top of cards (subtle inner separators). */
  hairline: "#1c2431",
  text: "#eef2f8",
  muted: "#9aa7ba",
  faint: "#6b7789",
  brand: "#7cc4ff",
  brand2: "#b79bff",
  gold: "#e8c37a",
  danger: "#ff6b6b",
  warn: "#ffb454",
  success: "#4fd1a1",
  live: "#4fd1a1",
  /** Ink color for text sitting on the bright brand button. */
  ink: "#06121f",
} as const;

/** 4pt spacing scale. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

/** Corner-radius scale. */
export const radius = { sm: 10, md: 12, lg: 16, xl: 20, pill: 999 } as const;

type StatusStyle = { fg: string; bg: string; label: string };

/** Per auction-status pill colors + human label. */
export const statusStyles: Record<string, StatusStyle> = {
  active: { fg: theme.success, bg: "rgba(79,209,161,0.14)", label: "Live" },
  scheduled: { fg: theme.brand, bg: "rgba(124,196,255,0.14)", label: "Soon" },
  sold: { fg: theme.gold, bg: "rgba(232,195,122,0.16)", label: "Sold" },
  closed: { fg: theme.faint, bg: "rgba(155,167,186,0.12)", label: "Ended" },
  canceled: { fg: theme.faint, bg: "rgba(155,167,186,0.12)", label: "Canceled" },
};

export function statusStyle(status: string): StatusStyle {
  return statusStyles[status] ?? { fg: theme.faint, bg: "rgba(155,167,186,0.12)", label: status };
}
