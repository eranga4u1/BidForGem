/**
 * Mail template barrel. Every template function returns a `RenderedEmail`
 * ({ subject, html, text }) — the plain-text body is authored deliberately, never
 * derived by stripping tags. Templates take typed data and absolute URLs (built
 * by the caller from config); they never accept pre-rendered HTML.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export type { Money } from "./money.js";
export { formatMoney } from "./money.js";
export { escapeHtml } from "./escape.js";

export { passwordResetEmail, type PasswordResetInput } from "./password-reset.js";
export { welcomeEmail, type WelcomeInput } from "./welcome.js";
export { outbidEmail, type OutbidInput } from "./outbid.js";
export { auctionWonEmail, type AuctionWonInput } from "./auction-won.js";
export { gemSoldEmail, type GemSoldInput } from "./gem-sold.js";
export { auctionEndedNoSaleEmail, type AuctionEndedNoSaleInput } from "./auction-ended-no-sale.js";
export { auctionLostEmail, type AuctionLostInput } from "./auction-lost.js";
export { postingFeeReceiptEmail, type PostingFeeReceiptInput } from "./posting-fee-receipt.js";
