import { Logger } from "@nestjs/common";
import type { EmailMessage, EmailProvider } from "./provider.js";

export interface LogEmailProvider extends EmailProvider {
  readonly kind: "log";
  /** Every message that WOULD have been sent, in order. Tests assert on this. */
  readonly sent: ReadonlyArray<EmailMessage>;
  clear(): void;
}

/**
 * No-network email provider. Records each intended message so tests (and local
 * dev) can assert what would have been sent, and logs a single non-sensitive
 * line — recipient + subject only, NEVER the body (which may carry a reset
 * token) and NEVER a token in the subject.
 */
export function createLogEmailProvider(): LogEmailProvider {
  const logger = new Logger("EmailLog");
  const sent: EmailMessage[] = [];
  return {
    kind: "log",
    sent,
    sendEmail(message: EmailMessage): Promise<void> {
      sent.push(message);
      logger.log(`[dev/no-send] to=${message.to} subject=${JSON.stringify(message.subject)}`);
      return Promise.resolve();
    },
    clear() {
      sent.length = 0;
    },
  };
}
