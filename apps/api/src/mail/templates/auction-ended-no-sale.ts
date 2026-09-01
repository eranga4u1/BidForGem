import { button, card, dataRow, heading, mutedNote, paragraph, spacer } from "./components.js";
import type { RenderedEmail } from "./index.js";
import { renderLayout } from "./layout.js";

export interface AuctionEndedNoSaleInput {
  recipientName: string;
  gemTitle: string;
  /** Absolute URL to relist / edit the listing. */
  relistUrl: string;
  /** Absolute URL to the closed auction. */
  auctionUrl: string;
}

export function auctionEndedNoSaleEmail(input: AuctionEndedNoSaleInput): RenderedEmail {
  const subject = "Your auction ended without a sale";
  const preheader = "The reserve wasn't met, or there were no bids. You can relist it.";

  const contentHtml =
    heading("Auction ended — no sale") +
    paragraph(`Hi ${input.recipientName},`) +
    paragraph(
      "Your auction has ended without a sale — the reserve wasn't met, or there were no bids. Your gem is back in your listings and ready to relist.",
    ) +
    card(dataRow({ label: "Gem", value: input.gemTitle })) +
    spacer(24) +
    button({ href: input.relistUrl, label: "Relist your gem" }) +
    spacer(20) +
    mutedNote("Prefer to review what happened first? Open the closed auction from your listings.");

  const text = [
    `Hi ${input.recipientName},`,
    "",
    `Your auction for "${input.gemTitle}" ended without a sale — the reserve wasn't met, or there were no bids.`,
    "Your gem is back in your listings and ready to relist.",
    "",
    `Relist it: ${input.relistUrl}`,
    `Review the closed auction: ${input.auctionUrl}`,
    "",
    "— BidForGem",
  ].join("\n");

  return { subject, html: renderLayout({ preheader, title: subject, contentHtml }), text };
}
