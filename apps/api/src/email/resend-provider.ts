import { Logger } from "@nestjs/common";
import type { RenderedEmail } from "../mail/templates/index.js";
import type { EmailProvider } from "./provider.js";

export interface ResendOptions {
  apiKey: string;
  /** Verified sender, e.g. "Gem <no-reply@yourdomain.com>". */
  from: string;
}

/**
 * Real transactional send via Resend's HTTP API — a single documented endpoint
 * (POST https://api.resend.com/emails, Bearer auth, JSON body). Using the HTTP
 * API directly avoids adding/pinning an SDK dependency (and the network install
 * that a restricted egress can't do). The API key comes from validated env and
 * is never logged.
 */
export function createResendEmailProvider(opts: ResendOptions): EmailProvider {
  const logger = new Logger("EmailResend");
  return {
    kind: "resend",
    async sendEmail(to: string, email: RenderedEmail): Promise<void> {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: opts.from,
          to,
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
      });
      if (!res.ok) {
        // Body may contain provider error detail but never our secret; log the
        // status only (subject is safe — it carries no token/PII by construction).
        logger.error(
          `Resend send failed (${res.status}) for subject ${JSON.stringify(email.subject)}`,
        );
        throw new Error(`Email send failed with status ${res.status}`);
      }
    },
  };
}
