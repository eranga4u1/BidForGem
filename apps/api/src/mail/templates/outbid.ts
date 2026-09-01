import { button, card, dataRow, heading, paragraph, spacer } from "./components.js";
import type { RenderedEmail } from "./index.js";
import { renderLayout } from "./layout.js";
import { formatMoney, type Money } from "./money.js";

export interface OutbidInput {
  recipientName: string;
  gemTitle: string;
  /** Absolute URL to the auction. */
  auctionUrl: string;
  currentBid: Money;
}

export function outbidEmail(input: OutbidInput): RenderedEmail {
  const subject = "You've been outbid on BidForGem";
  const preheader = "Someone placed a higher bid. Bid again to stay in the lead.";
  const price = formatMoney(input.currentBid);

  const contentHtml =
    heading("You've been outbid") +
    paragraph(`Hi ${input.recipientName},`) +
    paragraph("Someone placed a higher bid. There's still time to reclaim the lead.") +
    card(
      dataRow({ label: "Gem", value: input.gemTitle }) +
        dataRow({ label: "Current bid", value: price, strong: true }),
    ) +
    spacer(24) +
    button({ href: input.auctionUrl, label: "Place a higher bid" });

  const text = [
    `Hi ${input.recipientName},`,
    "",
    `You've been outbid on "${input.gemTitle}".`,
    `Current bid: ${price}`,
    "",
    `Bid again to stay in the lead: ${input.auctionUrl}`,
    "",
    "— BidForGem",
  ].join("\n");

  return { subject, html: renderLayout({ preheader, title: subject, contentHtml }), text };
}
