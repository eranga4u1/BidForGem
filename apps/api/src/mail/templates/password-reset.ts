import { button, heading, mutedNote, paragraph, spacer } from "./components.js";
import type { RenderedEmail } from "./index.js";
import { renderLayout } from "./layout.js";

export interface PasswordResetInput {
  recipientName: string;
  /** Absolute reset URL including the opaque token — body only, never the subject. */
  resetUrl: string;
  /** Human label for the expiry window, e.g. "30 minutes". */
  expiresInLabel: string;
}

export function passwordResetEmail(input: PasswordResetInput): RenderedEmail {
  const subject = "Reset your BidForGem password";
  const preheader = "Use the link inside to choose a new password. It can be used once.";

  const contentHtml =
    heading("Reset your password") +
    paragraph(`Hi ${input.recipientName},`) +
    paragraph(
      "We received a request to reset your BidForGem password. Choose a new one with the button below.",
    ) +
    spacer(8) +
    button({ href: input.resetUrl, label: "Reset your password" }) +
    spacer(24) +
    mutedNote(
      `This link expires in ${input.expiresInLabel} and can only be used once. If you didn't request a reset, you can safely ignore this email — your password won't change.`,
    );

  const text = [
    `Hi ${input.recipientName},`,
    "",
    "We received a request to reset your BidForGem password. Open the link below to choose a new one:",
    "",
    input.resetUrl,
    "",
    `This link expires in ${input.expiresInLabel} and can only be used once.`,
    "If you didn't request a reset, you can ignore this email — your password won't change.",
    "",
    "— BidForGem",
  ].join("\n");

  return { subject, html: renderLayout({ preheader, title: subject, contentHtml }), text };
}
