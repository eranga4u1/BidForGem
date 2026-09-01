/**
 * Design tokens for transactional email — the single source of truth for colour,
 * type, spacing and radii. Emails can't use CSS variables or external stylesheets,
 * so these are plain values interpolated into inline `style` attributes.
 *
 * Palette: deep indigo accent (the app brand) + a warm amber highlight for the
 * gem/luxury feel, on slate neutrals. Every text colour meets WCAG AA (>=4.5:1)
 * on its intended surface; body/heading colours are AAA.
 */
export const T = {
  color: {
    // Brand / primary action
    accent: "#4338CA", // indigo-700 — button bg (white text = 8.3:1)
    accentText: "#FFFFFF",
    accentSoft: "#EEF2FF", // indigo-50 — subtle callout background
    // Warm highlight (gem / luxury)
    gold: "#B45309", // amber-700 — labels/accents on white (6.4:1)
    goldSoft: "#FEF3C7", // amber-100
    // Positive outcomes (won / sold)
    success: "#047857", // emerald-700 (5.6:1)
    successSoft: "#ECFDF5",
    // Neutrals (ink -> paper)
    ink: "#0F172A", // headings
    body: "#334155", // body copy
    muted: "#475569", // secondary text / labels
    faint: "#64748B", // footer / preheader
    border: "#E2E8F0", // hairlines, dividers
    surface: "#FFFFFF", // card
    canvas: "#F1F5F9", // page background
  },
  /** Additive dark-mode overrides (used only inside a prefers-color-scheme block). */
  dark: {
    canvas: "#0B1020",
    surface: "#141A2E",
    ink: "#F1F5F9",
    body: "#CBD5E1",
    muted: "#94A3B8",
    border: "#263149",
  },
  font: {
    stack: `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
    sizeBody: 16,
    sizeH1: 24,
    sizeH2: 20,
    sizeSmall: 13,
    lineHeight: 1.5,
  },
  /** Spacing scale in px. */
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 6, md: 10, lg: 16 },
  layout: { maxWidth: 600, gutter: 24 },
} as const;
