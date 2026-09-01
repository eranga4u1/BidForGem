/**
 * Reusable email HTML fragments. Every fragment is table-based with fully inline
 * styles — no flexbox/grid/float/position, no `<style>` dependency. Leaf
 * components that take user text (heading, paragraph, mutedNote, button, dataRow)
 * escape it themselves, so escaping happens exactly once, at the interpolation
 * site. Container components (card) compose already-built fragment HTML and must
 * NOT be passed raw user text.
 */
import { escapeHtml } from "./escape.js";
import { T } from "./tokens.js";

const font = T.font.stack;

/** Section heading. `level` 1 (default) is the email's main title, 2 a subhead. */
export function heading(text: string, level: 1 | 2 = 1): string {
  const size = level === 1 ? T.font.sizeH1 : T.font.sizeH2;
  return `<h${level} style="margin:0 0 ${T.space.md}px;font-family:${font};font-size:${size}px;line-height:1.3;font-weight:700;color:${T.color.ink};">${escapeHtml(
    text,
  )}</h${level}>`;
}

/** Body paragraph (16px, 1.5 line-height). */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 ${T.space.lg}px;font-family:${font};font-size:${T.font.sizeBody}px;line-height:${T.font.lineHeight};color:${T.color.body};">${escapeHtml(
    text,
  )}</p>`;
}

/** Small, muted fine print (e.g. "If you didn't request this…"). */
export function mutedNote(text: string): string {
  return `<p style="margin:0;font-family:${font};font-size:${T.font.sizeSmall}px;line-height:${T.font.lineHeight};color:${T.color.faint};">${escapeHtml(
    text,
  )}</p>`;
}

/** Full-width hairline with vertical breathing room. */
export function divider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;"><tr><td style="padding:${T.space.lg}px 0;"><div style="height:1px;line-height:1px;font-size:0;background:${T.color.border};">&nbsp;</div></td></tr></table>`;
}

/**
 * Bulletproof CTA: a table cell carries the background + radius and a padded
 * anchor carries an explicit colour and text-decoration:none. Renders as a real
 * button in every client, including Outlook.
 */
export function button(opts: { href: string; label: string }): string {
  const href = escapeHtml(opts.href);
  const label = escapeHtml(opts.label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${T.color.accent}" style="border-radius:${T.radius.sm}px;"><a href="${href}" style="display:inline-block;padding:${T.space.md}px ${T.space.xl}px;font-family:${font};font-size:${T.font.sizeBody}px;line-height:1;font-weight:600;color:${T.color.accentText};text-decoration:none;border-radius:${T.radius.sm}px;">${label}</a></td></tr></table>`;
}

/**
 * A label/value row (e.g. "Final price" / "US$4,200.00"). `strong` renders the
 * value in the accent colour for emphasis (winning bid, amount due).
 */
export function dataRow(opts: { label: string; value: string; strong?: boolean }): string {
  const valueColor = opts.strong ? T.color.accent : T.color.ink;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;"><tr><td style="padding:${T.space.sm}px 0;font-family:${font};font-size:14px;line-height:1.4;color:${T.color.muted};">${escapeHtml(
    opts.label,
  )}</td><td align="right" style="padding:${T.space.sm}px 0;font-family:${font};font-size:${T.font.sizeBody}px;line-height:1.4;font-weight:700;color:${valueColor};">${escapeHtml(
    opts.value,
  )}</td></tr></table>`;
}

/**
 * A bordered, rounded box wrapping already-built fragment HTML. `tone` tints the
 * background: neutral (default), accent (indigo-soft) or success (emerald-soft).
 * Never pass raw user text here — compose from the leaf components above.
 */
export function card(
  innerHtml: string,
  tone: "neutral" | "accent" | "success" = "neutral",
): string {
  const bg =
    tone === "accent"
      ? T.color.accentSoft
      : tone === "success"
        ? T.color.successSoft
        : T.color.surface;
  const border = tone === "neutral" ? T.color.border : "transparent";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;"><tr><td style="background:${bg};border:1px solid ${border};border-radius:${T.radius.md}px;padding:${T.space.lg}px ${T.space.xl}px;">${innerHtml}</td></tr></table>`;
}

/** A vertical spacer for rhythm between blocks. */
export function spacer(px: number): string {
  return `<div style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</div>`;
}

/**
 * Optional hero image. Absolute https URL, explicit dimensions, alt text,
 * block display, border:0. The design must read fine if this is blocked — so it
 * never carries amounts/deadlines/CTA labels.
 */
export function heroImage(opts: {
  src: string;
  alt: string;
  width: number;
  height: number;
}): string {
  return `<img src="${escapeHtml(opts.src)}" alt="${escapeHtml(opts.alt)}" width="${opts.width}" height="${opts.height}" style="display:block;width:100%;max-width:${opts.width}px;height:auto;border:0;border-radius:${T.radius.md}px;" />`;
}
