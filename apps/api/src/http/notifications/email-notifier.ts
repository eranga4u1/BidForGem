import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNotNull } from "drizzle-orm";
import type { UserNotificationEvent } from "@gem/contracts";
import { auctions, gems, media, users } from "../../db/schema.js";
import type { EmailConfig } from "../../email/config.js";
import type { EmailProvider } from "../../email/provider.js";
import type { Db } from "../../gems/access.js";
import {
  auctionEndedNoSaleEmail,
  auctionLostEmail,
  auctionWonEmail,
  gemSoldEmail,
  outbidEmail,
  type RenderedEmail,
} from "../../mail/templates/index.js";
import { DB, EMAIL_CONFIG, EMAIL_PROVIDER } from "../tokens.js";

const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

interface AuctionContext {
  gemId: string;
  gemTitle: string;
  currency: string;
  recipientName: string;
  auctionUrl: string;
  browseUrl: string;
  relistUrl: string;
}

/**
 * Sends the email that CORRESPONDS to a user-scoped notification. Additive and
 * best-effort: the durable in-app row and socket push happen elsewhere; this
 * enriches the id-only payload with the gem title, auction currency and (for a
 * win) a primary photo, renders a branded template, and delegates to the
 * provider (the LOG provider when EMAIL_ENABLED is off). Never throws to the
 * caller — a failed email must not break notification delivery.
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
    try {
      const auctionId = asString(event.payload.auctionId);
      if (!auctionId) return;

      const [recipient] = await this.db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!recipient) return;

      const [ctx] = await this.db
        .select({ gemId: auctions.gemId, gemTitle: gems.title, currency: auctions.currency })
        .from(auctions)
        .innerJoin(gems, eq(gems.id, auctions.gemId))
        .where(eq(auctions.id, auctionId))
        .limit(1);
      if (!ctx) return;

      const base = this.config.appBaseUrl;
      const context: AuctionContext = {
        gemId: ctx.gemId,
        gemTitle: ctx.gemTitle,
        currency: ctx.currency,
        recipientName: recipient.name,
        auctionUrl: `${base}/auctions/${auctionId}`,
        browseUrl: `${base}/gems`,
        relistUrl: `${base}/gems/${ctx.gemId}/edit`,
      };

      const rendered = await this.render(event, context);
      if (!rendered) return;
      await this.email.sendEmail(recipient.email, rendered);
    } catch (err) {
      this.logger.error(
        `Failed to send ${event.type} email`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async primaryPhotoUrl(gemId: string): Promise<string | null> {
    const [photo] = await this.db
      .select({ url: media.url })
      .from(media)
      .where(
        and(
          eq(media.gemId, gemId),
          eq(media.type, "photo"),
          eq(media.status, "ready"),
          isNotNull(media.url),
        ),
      )
      .limit(1);
    return photo?.url ?? null;
  }

  private async render(
    event: UserNotificationEvent,
    c: AuctionContext,
  ): Promise<RenderedEmail | null> {
    const shared = {
      recipientName: c.recipientName,
      gemTitle: c.gemTitle,
      auctionUrl: c.auctionUrl,
    };
    switch (event.type) {
      case "OUTBID": {
        const amount = asNumber(event.payload.amount);
        if (amount === null) return null;
        const currency = asString(event.payload.currency) ?? c.currency;
        return outbidEmail({ ...shared, currentBid: { amount, currency } });
      }
      case "AUCTION_WON": {
        const amount = asNumber(event.payload.finalAmount);
        if (amount === null) return null;
        const photoUrl = await this.primaryPhotoUrl(c.gemId);
        return auctionWonEmail({
          ...shared,
          finalPrice: { amount, currency: c.currency },
          ...(photoUrl ? { gemImageUrl: photoUrl } : {}),
        });
      }
      case "AUCTION_SOLD": {
        const amount = asNumber(event.payload.finalAmount);
        if (amount === null) return null;
        return gemSoldEmail({ ...shared, finalPrice: { amount, currency: c.currency } });
      }
      case "AUCTION_ENDED_NO_SALE":
        return auctionEndedNoSaleEmail({
          recipientName: c.recipientName,
          gemTitle: c.gemTitle,
          relistUrl: c.relistUrl,
          auctionUrl: c.auctionUrl,
        });
      case "AUCTION_LOST":
        return auctionLostEmail({ ...shared, browseUrl: c.browseUrl });
      default:
        return null;
    }
  }
}
