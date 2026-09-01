import { button, heading, paragraph, spacer } from "./components.js";
import type { RenderedEmail } from "./index.js";
import { renderLayout } from "./layout.js";

export interface WelcomeInput {
  recipientName: string;
  /** Absolute URL to the gem marketplace. */
  browseUrl: string;
}

export function welcomeEmail(input: WelcomeInput): RenderedEmail {
  const subject = "Welcome to BidForGem";
  const preheader = "Your account is ready — start exploring live gem auctions.";

  const contentHtml =
    heading("Welcome to BidForGem") +
    paragraph(`Hi ${input.recipientName},`) +
    paragraph(
      "Your account is ready. Browse vetted gem listings, follow live auctions with real-time bidding, and list stones of your own.",
    ) +
    paragraph(
      "Every auction runs on a server-timed countdown with anti-snipe protection, so the price you see is the real one.",
    ) +
    spacer(8) +
    button({ href: input.browseUrl, label: "Browse live auctions" });

  const text = [
    `Hi ${input.recipientName},`,
    "",
    "Welcome to BidForGem! Your account is ready.",
    "",
    "Browse vetted gem listings, follow live auctions with real-time bidding, and list stones of your own. Every auction runs on a server-timed countdown with anti-snipe protection.",
    "",
    `Start here: ${input.browseUrl}`,
    "",
    "— BidForGem",
  ].join("\n");

  return { subject, html: renderLayout({ preheader, title: subject, contentHtml }), text };
}
