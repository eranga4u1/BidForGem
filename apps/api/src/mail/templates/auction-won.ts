import { button, card, dataRow, heading, heroImage, paragraph, spacer } from "./components.js";
import type { RenderedEmail } from "./index.js";
import { renderLayout } from "./layout.js";
import { formatMoney, type Money } from "./money.js";

export interface AuctionWonInput {
  recipientName: string;
  gemTitle: string;
  /** Absolute URL to the auction. */
  auctionUrl: string;
  finalPrice: Money;
  /** Optional absolute https image URL (R2 public bucket). Non-critical. */
  gemImageUrl?: string;
}

export function auctionWonEmail(input: AuctionWonInput): RenderedEmail {
  const subject = "Congratulations — you won an auction";
  const preheader = "You had the winning bid. Here are the details of your win.";
  const price = formatMoney(input.finalPrice);

  const image = input.gemImageUrl
    ? heroImage({ src: input.gemImageUrl, alt: input.gemTitle, width: 552, height: 300 }) +
      spacer(20)
    : "";

  const contentHtml =
    heading("You won! 🎉") +
    paragraph(`Hi ${input.recipientName},`) +
    paragraph("Congratulations — you had the winning bid when the auction closed.") +
    image +
    card(
      dataRow({ label: "Gem", value: input.gemTitle }) +
        dataRow({ label: "Winning bid", value: price, strong: true }),
      "success",
    ) +
    spacer(24) +
    button({ href: input.auctionUrl, label: "View your win" });

  const text = [
    `Hi ${input.recipientName},`,
    "",
    `Congratulations — you won "${input.gemTitle}"!`,
    `Winning bid: ${price}`,
    "",
    `View the details: ${input.auctionUrl}`,
    "",
    "— BidForGem",
  ].join("\n");

  return { subject, html: renderLayout({ preheader, title: subject, contentHtml }), text };
}
