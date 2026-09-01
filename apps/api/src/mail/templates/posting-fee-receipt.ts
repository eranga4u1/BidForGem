import { button, card, dataRow, heading, mutedNote, paragraph, spacer } from "./components.js";
import type { RenderedEmail } from "./index.js";
import { renderLayout } from "./layout.js";
import { formatMoney, type Money } from "./money.js";

export interface PostingFeeReceiptInput {
  recipientName: string;
  gemTitle: string;
  /** Absolute URL to the published listing. */
  listingUrl: string;
  fee: Money;
  /** Payment reference / intent id. */
  reference: string;
  /** Human-readable payment date, e.g. "18 Aug 2026". */
  paidAt: string;
}

export function postingFeeReceiptEmail(input: PostingFeeReceiptInput): RenderedEmail {
  const subject = "Your BidForGem posting-fee receipt";
  const preheader = "Payment received — your listing is now live.";
  const amount = formatMoney(input.fee);

  const contentHtml =
    heading("Payment receipt") +
    paragraph(`Hi ${input.recipientName},`) +
    paragraph("Thanks — we've received your posting fee and your listing is now live.") +
    card(
      dataRow({ label: "Gem", value: input.gemTitle }) +
        dataRow({ label: "Amount paid", value: amount, strong: true }) +
        dataRow({ label: "Reference", value: input.reference }) +
        dataRow({ label: "Date", value: input.paidAt }),
    ) +
    spacer(24) +
    button({ href: input.listingUrl, label: "View your listing" }) +
    spacer(20) +
    mutedNote("Please keep this email for your records. This is a receipt for a posting fee only.");

  const text = [
    `Hi ${input.recipientName},`,
    "",
    "Thanks — we've received your posting fee and your listing is now live.",
    "",
    `Gem: ${input.gemTitle}`,
    `Amount paid: ${amount}`,
    `Reference: ${input.reference}`,
    `Date: ${input.paidAt}`,
    "",
    `View your listing: ${input.listingUrl}`,
    "",
    "Please keep this email for your records.",
    "",
    "— BidForGem",
  ].join("\n");

  return { subject, html: renderLayout({ preheader, title: subject, contentHtml }), text };
}
