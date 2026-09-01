import type { RenderedEmail } from "../mail/templates/index.js";

/** A rendered email plus its recipient — what the log provider records. */
export interface SentEmail extends RenderedEmail {
  to: string;
}

/**
 * Transactional email delivery. Implementations: `resend` (real HTTP send) and
 * `log` (records intent, no network — used in tests and when EMAIL_ENABLED is
 * off). Callers never branch on the implementation. The content is a fully
 * rendered `{ subject, html, text }`; the recipient is passed separately.
 */
export interface EmailProvider {
  readonly kind: "resend" | "log";
  sendEmail(to: string, email: RenderedEmail): Promise<void>;
}
