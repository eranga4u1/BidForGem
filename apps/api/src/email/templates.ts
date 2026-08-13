import type { NotificationType, UserNotificationEvent } from "@gem/types";
import type { EmailMessage } from "./provider.js";

/** A message body without the recipient — the caller fills in `to`. */
export type RenderedEmail = Omit<EmailMessage, "to">;

/** Only these notification types produce an email. */
const EMAILABLE: ReadonlySet<NotificationType> = new Set([
  "AUCTION_WON",
  "OUTBID",
  "AUCTION_SOLD",
  "AUCTION_ENDED_NO_SALE",
]);

/** Whether a notification type produces an email at all. */
export function isEmailableNotification(type: NotificationType): boolean {
  return EMAILABLE.has(type);
}

const money = (v: unknown): string =>
  typeof v === "number" && Number.isFinite(v) ? (v / 100).toFixed(2) : "";

function wrap(heading: string, lines: string[], link: string): string {
  const body = lines.map((l) => `<p>${l}</p>`).join("");
  return `<div><h2>${heading}</h2>${body}<p><a href="${link}">View the auction</a></p></div>`;
}

export interface NotificationEmailOptions {
  appBaseUrl: string;
  name: string;
}

/**
 * Render a notification email, or `null` if the type isn't emailable. Subjects
 * are generic — they never contain amounts, ids, tokens, or the recipient.
 */
export function notificationEmail(
  event: UserNotificationEvent,
  opts: NotificationEmailOptions,
): RenderedEmail | null {
  if (!EMAILABLE.has(event.type)) return null;

  const auctionId = typeof event.payload.auctionId === "string" ? event.payload.auctionId : "";
  const link = `${opts.appBaseUrl}/auctions/${auctionId}`;
  const amount = money(event.payload.finalAmount ?? event.payload.amount);
  const hi = `Hi ${opts.name},`;

  switch (event.type) {
    case "AUCTION_WON":
      return {
        subject: "You won an auction on Gem",
        text: `${hi}\n\nCongratulations — you won the auction${amount ? ` with a final bid of ${amount}` : ""}.\n\nView it: ${link}`,
        html: wrap("You won!", [hi, `Your winning bid${amount ? ` was ${amount}` : ""}.`], link),
      };
    case "OUTBID":
      return {
        subject: "You've been outbid on Gem",
        text: `${hi}\n\nSomeone placed a higher bid${amount ? ` (${amount})` : ""}. Bid again to stay in the lead.\n\n${link}`,
        html: wrap(
          "You've been outbid",
          [hi, `The current bid${amount ? ` is ${amount}` : ""}.`],
          link,
        ),
      };
    case "AUCTION_SOLD":
      return {
        subject: "Your gem sold on Gem",
        text: `${hi}\n\nYour auction closed with a sale${amount ? ` for ${amount}` : ""}.\n\n${link}`,
        html: wrap(
          "Your gem sold",
          [hi, `Final price${amount ? `: ${amount}` : " reached."}`],
          link,
        ),
      };
    case "AUCTION_ENDED_NO_SALE":
      return {
        subject: "Your auction ended without a sale",
        text: `${hi}\n\nYour auction ended without meeting the reserve (or with no bids). You can relist it.\n\n${link}`,
        html: wrap(
          "Auction ended — no sale",
          [hi, "The reserve wasn't met, or there were no bids."],
          link,
        ),
      };
    default:
      return null;
  }
}

export interface PasswordResetEmailOptions {
  name: string;
  /** Full reset link including the opaque token (body only — never the subject/logs). */
  resetUrl: string;
}

export function passwordResetEmail(opts: PasswordResetEmailOptions): RenderedEmail {
  const hi = `Hi ${opts.name},`;
  return {
    subject: "Reset your Gem password",
    text: `${hi}\n\nWe received a request to reset your password. This link expires soon and can be used once:\n\n${opts.resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<div><h2>Reset your password</h2><p>${hi}</p><p>This link expires soon and can be used once:</p><p><a href="${opts.resetUrl}">Reset your password</a></p><p>If you didn't request this, you can ignore this email.</p></div>`,
  };
}
