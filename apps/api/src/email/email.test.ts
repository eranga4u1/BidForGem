import { describe, expect, it } from "vitest";
import { loadEmailConfig } from "./config.js";
import { createEmailProvider } from "./index.js";
import { createLogEmailProvider } from "./log-provider.js";

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
  it("records the recipient + rendered email instead of sending", async () => {
    const log = createLogEmailProvider();
    await log.sendEmail("a@b.com", { subject: "Hi", html: "<p>Hi</p>", text: "body" });
    expect(log.sent).toHaveLength(1);
    expect(log.sent[0]).toMatchObject({ to: "a@b.com", subject: "Hi", text: "body" });
  });
});
