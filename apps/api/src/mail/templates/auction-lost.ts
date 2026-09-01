import { button, card, dataRow, heading, mutedNote, paragraph, spacer } from "./components.js";
import type { RenderedEmail } from "./index.js";
import { renderLayout } from "./layout.js";

export interface AuctionLostInput {
  recipientName: string;
  gemTitle: string;
  /** Absolute URL to the closed auction. */
  auctionUrl: string;
  /** Absolute URL to keep browsing. */
  browseUrl: string;
}

export function auctionLostEmail(input: AuctionLostInput): RenderedEmail {
  const subject = "The auction has ended";
  const preheader = "This one went to another bidder — plenty more to explore.";

  const contentHtml =
    heading("The auction has ended") +
    paragraph(`Hi ${input.recipientName},`) +
    paragraph(
      "Thanks for bidding — this one went to another bidder. There are always more stones coming to auction.",
    ) +
    card(dataRow({ label: "Gem", value: input.gemTitle })) +
    spacer(24) +
    button({ href: input.browseUrl, label: "Browse more auctions" }) +
    spacer(20) +
    mutedNote("You can still view the final result of this auction from your activity.");

  const text = [
    `Hi ${input.recipientName},`,
    "",
    `Thanks for bidding on "${input.gemTitle}" — this one went to another bidder.`,
    "There are always more stones coming to auction.",
    "",
    `Browse more: ${input.browseUrl}`,
    `See the final result: ${input.auctionUrl}`,
    "",
    "— BidForGem",
  ].join("\n");

  return { subject, html: renderLayout({ preheader, title: subject, contentHtml }), text };
}
