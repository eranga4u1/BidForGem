/**
 * Full HTML document wrapper. Table-based, 600px centred container that goes
 * fluid below 600px, a text brand header (no image dependency), a white content
 * surface, and a footer. All layout styles are inline so the email is correct
 * with the `<style>` block stripped; that block only carries the responsive
 * `@media` rule and a `prefers-color-scheme` dark treatment that flips the outer
 * canvas/footer/brand (the white content card stays light in both modes, so
 * content text never lands dark-on-dark).
 */
import { escapeHtml } from "./escape.js";
import { T } from "./tokens.js";

const font = T.font.stack;

export interface LayoutOptions {
  preheader: string;
  title: string;
  contentHtml: string;
  footerHtml?: string;
}

/** Hidden preview text, padded so the client preview doesn't leak body copy. */
function preheaderSpan(text: string): string {
  const pad = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<span style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${T.color.canvas};">${escapeHtml(
    text,
  )}${pad}</span>`;
}

function brandHeader(): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;"><tr><td style="padding:0 0 ${T.space.lg}px;font-family:${font};font-size:18px;font-weight:700;letter-spacing:0.2px;">` +
    `<span style="color:${T.color.gold};">&#9670;</span> <span class="on-canvas" style="color:${T.color.ink};">BidForGem</span>` +
    `</td></tr></table>`
  );
}

function defaultFooter(): string {
  return (
    `<p class="on-canvas" style="margin:0 0 ${T.space.xs}px;font-family:${font};font-size:${T.font.sizeSmall}px;line-height:1.5;color:${T.color.faint};">You're receiving this because you have a BidForGem account.</p>` +
    `<p class="on-canvas" style="margin:0;font-family:${font};font-size:${T.font.sizeSmall}px;line-height:1.5;color:${T.color.faint};">BidForGem &middot; Live gem auctions</p>`
  );
}

export function renderLayout(opts: LayoutOptions): string {
  const footer = opts.footerHtml ?? defaultFooter();
  const style = [
    "@media only screen and (max-width:600px){",
    "  .email-container{width:100% !important;}",
    "  .px{padding-left:20px !important;padding-right:20px !important;}",
    "}",
    "@media (prefers-color-scheme:dark){",
    `  body,.email-bg{background:${T.dark.canvas} !important;}`,
    `  .on-canvas{color:${T.dark.muted} !important;}`,
    "}",
  ].join("\n");

  return `<!doctype html>
<html lang="en" style="margin:0;padding:0;">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(opts.title)}</title>
<style>
${style}
</style>
</head>
<body style="margin:0;padding:0;background:${T.color.canvas};-webkit-text-size-adjust:100%;">
${preheaderSpan(opts.preheader)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-bg" bgcolor="${T.color.canvas}" style="width:100%;background:${T.color.canvas};">
  <tr>
    <td align="center" style="padding:${T.space.xxl}px ${T.space.md}px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${T.layout.maxWidth}" class="email-container" style="width:${T.layout.maxWidth}px;max-width:${T.layout.maxWidth}px;">
        <tr><td class="px" style="padding:0 ${T.layout.gutter}px ${T.space.lg}px;">${brandHeader()}</td></tr>
        <tr><td class="px" style="padding:0 ${T.layout.gutter}px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-card" style="width:100%;background:${T.color.surface};border:1px solid ${T.color.border};border-radius:${T.radius.lg}px;">
            <tr><td style="padding:${T.space.xxl}px;">
${opts.contentHtml}
            </td></tr>
          </table>
        </td></tr>
        <tr><td class="px" style="padding:${T.space.xl}px ${T.layout.gutter}px;">
${footer}
        </td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
