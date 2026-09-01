import { describe, expect, it } from "vitest";
import type { RenderedEmail } from "./index.js";
import {
  auctionEndedNoSaleEmail,
  auctionLostEmail,
  auctionWonEmail,
  gemSoldEmail,
  outbidEmail,
  passwordResetEmail,
  postingFeeReceiptEmail,
  welcomeEmail,
} from "./index.js";

const B = "https://bidforgem.com";

/** Each template with sample data and the primary absolute action URL it must expose. */
const cases: { name: string; email: RenderedEmail; actionUrl: string }[] = [
  {
    name: "password-reset",
    email: passwordResetEmail({
      recipientName: "Ada",
      resetUrl: `${B}/reset-password?token=SECRET-abc`,
      expiresInLabel: "30 minutes",
    }),
    actionUrl: `${B}/reset-password?token=SECRET-abc`,
  },
  {
    name: "welcome",
    email: welcomeEmail({ recipientName: "Ada", browseUrl: `${B}/gems` }),
    actionUrl: `${B}/gems`,
  },
  {
    name: "outbid",
    email: outbidEmail({
      recipientName: "Ada",
      gemTitle: "Ceylon Sapphire",
      auctionUrl: `${B}/auctions/a1`,
      currentBid: { amount: 55000, currency: "USD" },
    }),
    actionUrl: `${B}/auctions/a1`,
  },
  {
    name: "auction-won",
    email: auctionWonEmail({
      recipientName: "Ada",
      gemTitle: "Ceylon Sapphire",
      auctionUrl: `${B}/auctions/a1`,
      finalPrice: { amount: 420000, currency: "USD" },
    }),
    actionUrl: `${B}/auctions/a1`,
  },
  {
    name: "gem-sold",
    email: gemSoldEmail({
      recipientName: "Ada",
      gemTitle: "Ceylon Sapphire",
      auctionUrl: `${B}/auctions/a1`,
      finalPrice: { amount: 420000, currency: "USD" },
    }),
    actionUrl: `${B}/auctions/a1`,
  },
  {
    name: "auction-ended-no-sale",
    email: auctionEndedNoSaleEmail({
      recipientName: "Ada",
      gemTitle: "Ceylon Sapphire",
      relistUrl: `${B}/gems/g1/edit`,
      auctionUrl: `${B}/auctions/a1`,
    }),
    actionUrl: `${B}/gems/g1/edit`,
  },
  {
    name: "auction-lost",
    email: auctionLostEmail({
      recipientName: "Ada",
      gemTitle: "Ceylon Sapphire",
      auctionUrl: `${B}/auctions/a1`,
      browseUrl: `${B}/gems`,
    }),
    actionUrl: `${B}/gems`,
  },
  {
    name: "posting-fee-receipt",
    email: postingFeeReceiptEmail({
      recipientName: "Ada",
      gemTitle: "Ceylon Sapphire",
      listingUrl: `${B}/gems/g1`,
      fee: { amount: 500, currency: "USD" },
      reference: "pi_123",
      paidAt: "18 Aug 2026",
    }),
    actionUrl: `${B}/gems/g1`,
  },
];

describe("email templates", () => {
  for (const c of cases) {
    describe(c.name, () => {
      it("has a non-empty subject with no unresolved placeholder", () => {
        expect(c.email.subject.length).toBeGreaterThan(0);
        expect(c.email.subject).not.toMatch(/undefined|\$\{|\[object Object\]|NaN/);
      });
      it("renders a complete html document with no unresolved placeholder", () => {
        expect(c.email.html).toContain("<!doctype html>");
        expect(c.email.html).toContain("</html>");
        expect(c.email.html).not.toMatch(/undefined|\[object Object\]|NaN/);
      });
      it("puts the absolute action URL in both the html and the plain text", () => {
        expect(c.email.html).toContain(c.actionUrl);
        expect(c.email.text).toContain(c.actionUrl);
      });
      it("has a deliberate, non-empty plain-text body", () => {
        expect(c.email.text.trim().length).toBeGreaterThan(40);
        expect(c.email.text).not.toContain("<");
      });
      it("matches snapshot", () => {
        expect(c.email.html).toMatchSnapshot("html");
        expect(c.email.text).toMatchSnapshot("text");
      });
    });
  }

  it("escapes hostile user input in the html — no raw script or markup", () => {
    const email = outbidEmail({
      recipientName: 'Ruby & "Star" <b>',
      gemTitle: "<script>alert(1)</script>",
      auctionUrl: `${B}/auctions/a1`,
      currentBid: { amount: 1000, currency: "USD" },
    });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).not.toContain('Ruby & "Star" <b>');
    expect(email.html).toContain("Ruby &amp; &quot;Star&quot; &lt;b&gt;");
  });

  it("keeps the reset token in the body only, never the subject", () => {
    const email = passwordResetEmail({
      recipientName: "Ada",
      resetUrl: `${B}/reset-password?token=SECRET-abc`,
      expiresInLabel: "30 minutes",
    });
    expect(email.subject).not.toContain("SECRET-abc");
    expect(email.subject.toLowerCase()).not.toContain("token");
    expect(email.text).toContain("SECRET-abc");
  });
});
