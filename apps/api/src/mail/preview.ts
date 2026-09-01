/**
 * Dev-only: render every email template with sample data to
 * apps/api/.email-previews/ (gitignored) so the HTML can be opened in a browser
 * and pasted into a real client for a visual check. Tests don't catch layout
 * breakage — this is the point.
 *
 *   pnpm --filter @gem/api email:preview
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RenderedEmail } from "./templates/index.js";
import {
  auctionEndedNoSaleEmail,
  auctionLostEmail,
  auctionWonEmail,
  gemSoldEmail,
  outbidEmail,
  passwordResetEmail,
  postingFeeReceiptEmail,
  welcomeEmail,
} from "./templates/index.js";

const base = "https://bidforgem.com";
const image = "https://pub-4ff71ffd596049f7b75733c3649852b6.r2.dev/preview-gem.jpg";

const samples: Record<string, RenderedEmail> = {
  welcome: welcomeEmail({ recipientName: "Ada Lovelace", browseUrl: `${base}/gems` }),
  "password-reset": passwordResetEmail({
    recipientName: "Ada Lovelace",
    resetUrl: `${base}/reset-password?token=preview-token-abc123`,
    expiresInLabel: "30 minutes",
  }),
  outbid: outbidEmail({
    recipientName: "Ada Lovelace",
    gemTitle: "Ceylon Cornflower Sapphire",
    auctionUrl: `${base}/auctions/demo`,
    currentBid: { amount: 552500, currency: "USD" },
  }),
  "auction-won": auctionWonEmail({
    recipientName: "Ada Lovelace",
    gemTitle: "Burmese Pigeon-Blood Ruby",
    auctionUrl: `${base}/auctions/demo`,
    finalPrice: { amount: 850000, currency: "USD" },
    gemImageUrl: image,
  }),
  "gem-sold": gemSoldEmail({
    recipientName: "Vault Seller",
    gemTitle: "Colombian Emerald",
    auctionUrl: `${base}/auctions/demo`,
    finalPrice: { amount: 1200000, currency: "USD" },
  }),
  "auction-ended-no-sale": auctionEndedNoSaleEmail({
    recipientName: "Vault Seller",
    gemTitle: "Kashmir Blue Sapphire",
    relistUrl: `${base}/gems/demo/edit`,
    auctionUrl: `${base}/auctions/demo`,
  }),
  "auction-lost": auctionLostEmail({
    recipientName: "Leo Alvarez",
    gemTitle: "Fancy Yellow Diamond",
    auctionUrl: `${base}/auctions/demo`,
    browseUrl: `${base}/gems`,
  }),
  "posting-fee-receipt": postingFeeReceiptEmail({
    recipientName: "Vault Seller",
    gemTitle: "Ceylon Cornflower Sapphire",
    listingUrl: `${base}/gems/demo`,
    fee: { amount: 500, currency: "USD" },
    reference: "pi_preview_123",
    paidAt: "18 Aug 2026",
  }),
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".email-previews");
mkdirSync(outDir, { recursive: true });

const rows: string[] = [];
for (const [name, email] of Object.entries(samples)) {
  writeFileSync(join(outDir, `${name}.html`), email.html, "utf8");
  writeFileSync(join(outDir, `${name}.txt`), email.text, "utf8");
  rows.push(
    `<li><a href="./${name}.html">${name}</a> — <em>${email.subject}</em> (<a href="./${name}.txt">plain text</a>)</li>`,
  );
}
writeFileSync(
  join(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:sans-serif;max-width:640px;margin:40px auto;color:#0f172a"><h1>BidForGem email previews</h1><ul style="line-height:1.9">${rows.join(
    "",
  )}</ul></body>`,
  "utf8",
);

console.log(`Wrote ${Object.keys(samples).length} previews to ${outDir}`);
