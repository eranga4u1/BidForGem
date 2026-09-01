import { button, card, dataRow, heading, paragraph, spacer } from "./components.js";
import type { RenderedEmail } from "./index.js";
import { renderLayout } from "./layout.js";
import { formatMoney, type Money } from "./money.js";

export interface GemSoldInput {
  recipientName: string;
  gemTitle: string;
  /** Absolute URL to the auction. */
  auctionUrl: string;
  finalPrice: Money;
}

export function gemSoldEmail(input: GemSoldInput): RenderedEmail {
  const subject = "Your gem sold on BidForGem";
  const preheader = "Your auction closed with a sale. Here's the final price.";
  const price = formatMoney(input.finalPrice);

  const contentHtml =
    heading("Your gem sold") +
    paragraph(`Hi ${input.recipientName},`) +
    paragraph("Good news — your auction closed with a winning bid above the reserve.") +
    card(
      dataRow({ label: "Gem", value: input.gemTitle }) +
        dataRow({ label: "Final price", value: price, strong: true }),
      "success",
    ) +
    spacer(24) +
    button({ href: input.auctionUrl, label: "View the sale" });

  const text = [
    `Hi ${input.recipientName},`,
    "",
    `Good news — "${input.gemTitle}" sold.`,
    `Final price: ${price}`,
    "",
    `View the sale: ${input.auctionUrl}`,
    "",
    "— BidForGem",
  ].join("\n");

  return { subject, html: renderLayout({ preheader, title: subject, contentHtml }), text };
}
