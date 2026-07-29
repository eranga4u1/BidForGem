import { describe, expect, it } from "vitest";
import type { UserNotificationEvent } from "@gem/types";
import { loadEmailConfig } from "./config.js";
import { createEmailProvider } from "./index.js";
import { createLogEmailProvider } from "./log-provider.js";
import { notificationEmail, passwordResetEmail } from "./templates.js";

describe("email config", () => {
  it("defaults to disabled (log provider) with no env", () => {
    const cfg = loadEmailConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.apiKey).toBeNull();
    expect(createEmailProvider(cfg).kind).toBe("log");
  });

  it("fails fast when enabled without an API key", () => {
    expect(() => loadEmailConfig({ EMAIL_ENABLED: "true" })).toThrow(/EMAIL_API_KEY/);
  });

  it("uses the real provider when enabled with a key", () => {
    const cfg = loadEmailConfig({ EMAIL_ENABLED: "true", EMAIL_API_KEY: "re_test_key" });
    expect(cfg.enabled).toBe(true);
    expect(createEmailProvider(cfg).kind).toBe("resend");
  });
});

describe("log provider", () => {
  it("records what would have been sent instead of sending", async () => {
    const log = createLogEmailProvider();
    await log.sendEmail({ to: "a@b.com", subject: "Hi", text: "body" });
    expect(log.sent).toHaveLength(1);
    expect(log.sent[0]).toMatchObject({ to: "a@b.com", subject: "Hi" });
  });
});

describe("templates", () => {
  const base = (type: UserNotificationEvent["type"]): UserNotificationEvent => ({
    type,
    payload: { auctionId: "auc-123", gemId: "gem-9", finalAmount: 16000, amount: 16000 },
    createdAt: new Date().toISOString(),
  });
  const opts = { appBaseUrl: "http://localhost:3000", name: "Ada" };

  it("renders each emailable type with a link, and no token/PII/amount in the subject", () => {
    for (const type of [
      "AUCTION_WON",
      "OUTBID",
      "AUCTION_SOLD",
      "AUCTION_ENDED_NO_SALE",
    ] as const) {
      const msg = notificationEmail(base(type), opts);
      expect(msg).not.toBeNull();
      if (!msg) continue;
      expect(msg.text).toContain("http://localhost:3000/auctions/auc-123");
      // Subject is generic: no id, no amount, no recipient name.
      expect(msg.subject).not.toContain("auc-123");
      expect(msg.subject).not.toContain("160.00");
      expect(msg.subject).not.toContain("Ada");
    }
  });

  it("returns null for non-emailable notification types", () => {
    expect(notificationEmail(base("AUCTION_LOST"), opts)).toBeNull();
  });

  it("keeps the reset token in the body only, never the subject", () => {
    const url = "http://localhost:3000/reset-password?token=SECRET-TOKEN-abc";
    const msg = passwordResetEmail({ name: "Ada", resetUrl: url });
    expect(msg.subject).not.toContain("SECRET-TOKEN-abc");
    expect(msg.subject).not.toContain("token");
    expect(msg.text).toContain(url);
  });
});
