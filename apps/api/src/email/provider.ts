/** A single transactional email. `text` is required; `html` is optional. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Transactional email delivery. Implementations: `resend` (real HTTP send) and
 * `log` (records intent, no network — used in tests and when EMAIL_ENABLED is
 * off). Callers never branch on the implementation.
 */
export interface EmailProvider {
  readonly kind: "resend" | "log";
  sendEmail(message: EmailMessage): Promise<void>;
}
