import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { UserNotificationEvent } from "@gem/types";
import type { EmailConfig } from "../../email/config.js";
import type { EmailProvider } from "../../email/provider.js";
import { isEmailableNotification, notificationEmail } from "../../email/templates.js";
import { users } from "../../db/schema.js";
import type { Db } from "../../gems/access.js";
import { DB, EMAIL_CONFIG, EMAIL_PROVIDER } from "../tokens.js";

/**
 * Sends the email that CORRESPONDS to a user-scoped notification. This is
 * additive: the durable in-app row is written in the domain transaction and the
 * socket push happens elsewhere — this only adds an email. Best-effort: it
 * resolves the recipient, renders a template, and delegates to the provider
 * (the LOG provider when EMAIL_ENABLED is off, so nothing hits the network).
 * Never throws to the caller; a failed email must not break delivery.
 */
@Injectable()
export class EmailNotifier {
  private readonly logger = new Logger("EmailNotifier");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(EMAIL_CONFIG) private readonly config: EmailConfig,
  ) {}

  async notify(userId: string, event: UserNotificationEvent): Promise<void> {
    if (!isEmailableNotification(event.type)) return;
    try {
      const [user] = await this.db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) return;

      const rendered = notificationEmail(event, {
        appBaseUrl: this.config.appBaseUrl,
        name: user.name,
      });
      if (!rendered) return;
      await this.email.sendEmail({ to: user.email, ...rendered });
    } catch (err) {
      this.logger.error(
        `Failed to send ${event.type} email`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
