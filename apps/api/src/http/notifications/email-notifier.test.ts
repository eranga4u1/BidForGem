import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuctionClosedEvent, UserNotificationEvent } from "@gem/types";
import type { EmailConfig } from "../../email/config.js";
import { createLogEmailProvider, type LogEmailProvider } from "../../email/log-provider.js";
import { insertUser, makeTestDb, type AnyDb } from "../../test/harness.js";
import { CompositeNotificationDispatcher } from "./composite-dispatcher.js";
import { EmailNotifier } from "./email-notifier.js";
import type { SocketNotificationDispatcher } from "./socket-dispatcher.js";

const config: EmailConfig = {
  enabled: false,
  from: "Gem <no-reply@gem.local>",
  apiKey: null,
  appBaseUrl: "http://localhost:3000",
};

const event = (type: UserNotificationEvent["type"]): UserNotificationEvent => ({
  type,
  payload: { auctionId: "a1", gemId: "g1", amount: 12000, finalAmount: 12000 },
  createdAt: new Date().toISOString(),
});

describe("EmailNotifier", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let log: LogEmailProvider;
  let notifier: EmailNotifier;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    log = createLogEmailProvider();
    notifier = new EmailNotifier(db, log, config);
  });
  afterEach(async () => {
    await close();
  });

  it("emails the recipient for an emailable notification — recorded by the log provider", async () => {
    const user = await insertUser(db, { name: "Ada", email: "ada@example.test" });
    await notifier.notify(user.id, event("OUTBID"));
    expect(log.sent).toHaveLength(1);
    expect(log.sent[0]?.to).toBe("ada@example.test");
    expect(log.sent[0]?.subject).toMatch(/outbid/i);
    // The token/PII rule: subject carries no id or amount.
    expect(log.sent[0]?.subject).not.toContain("a1");
  });

  it("skips notification types that are not emailable", async () => {
    const user = await insertUser(db, { name: "Ada" });
    await notifier.notify(user.id, event("AUCTION_LOST"));
    expect(log.sent).toHaveLength(0);
  });

  it("no-ops (and never throws) for an unknown recipient", async () => {
    await expect(
      notifier.notify("00000000-0000-0000-0000-000000000000", event("AUCTION_WON")),
    ).resolves.toBeUndefined();
    expect(log.sent).toHaveLength(0);
  });
});

describe("CompositeNotificationDispatcher", () => {
  it("keeps in-app (socket) delivery and ADDS email", () => {
    const socket = {
      auctionClosed: vi.fn(),
      userNotification: vi.fn(),
    } as unknown as SocketNotificationDispatcher;
    const emailer = { notify: vi.fn().mockResolvedValue(undefined) } as unknown as EmailNotifier;
    const composite = new CompositeNotificationDispatcher(socket, emailer);

    const ev: UserNotificationEvent = {
      type: "AUCTION_WON",
      payload: { auctionId: "a1" },
      createdAt: new Date().toISOString(),
    };
    composite.userNotification("u1", ev);
    expect(socket.userNotification).toHaveBeenCalledWith("u1", ev); // in-app, unchanged
    expect(emailer.notify).toHaveBeenCalledWith("u1", ev); // email, additive

    const closed: AuctionClosedEvent = { auctionId: "a1", winnerId: "u1", finalAmount: 100 };
    composite.auctionClosed(closed);
    expect(socket.auctionClosed).toHaveBeenCalledWith(closed);
  });
});
