import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuctionClosedEvent, UserNotificationEvent } from "@gem/contracts";
import type { EmailConfig } from "../../email/config.js";
import { createLogEmailProvider, type LogEmailProvider } from "../../email/log-provider.js";
import {
  insertAuction,
  insertGem,
  insertUser,
  makeTestDb,
  type AnyDb,
} from "../../test/harness.js";
import { CompositeNotificationDispatcher } from "./composite-dispatcher.js";
import { EmailNotifier } from "./email-notifier.js";
import type { SocketNotificationDispatcher } from "./socket-dispatcher.js";

const config: EmailConfig = {
  enabled: false,
  from: "Gem <no-reply@gem.local>",
  apiKey: null,
  appBaseUrl: "http://localhost:3000",
};
const GEM_TITLE = "Ceylon Blue Sapphire";
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

describe("EmailNotifier", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let log: LogEmailProvider;
  let notifier: EmailNotifier;
  let auctionId: string;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    log = createLogEmailProvider();
    notifier = new EmailNotifier(db, log, config);
    const seller = await insertUser(db, { name: "Seller" });
    const gem = await insertGem(db, seller.id, { title: GEM_TITLE });
    const auction = await insertAuction(db, gem.id, { currency: "USD" });
    auctionId = auction.id;
  });
  afterEach(async () => {
    await close();
  });

  const event = (type: UserNotificationEvent["type"]): UserNotificationEvent => ({
    type,
    payload: { auctionId, amount: 12000, finalAmount: 12000, currency: "USD" },
    createdAt: new Date().toISOString(),
  });

  it("emails the outbid recipient with the gem title + amount in the body, not the subject", async () => {
    const user = await insertUser(db, { name: "Ada", email: "ada@example.test" });
    await notifier.notify(user.id, event("OUTBID"));
    expect(log.sent).toHaveLength(1);
    expect(log.sent[0]?.to).toBe("ada@example.test");
    expect(log.sent[0]?.subject).toMatch(/outbid/i);
    // Subject stays generic: no id, no amount.
    expect(log.sent[0]?.subject).not.toContain(auctionId);
    expect(log.sent[0]?.subject).not.toContain("120.00");
    // Body carries the enriched gem title + the absolute auction URL.
    expect(log.sent[0]?.html).toContain(GEM_TITLE);
    expect(log.sent[0]?.text).toContain(`http://localhost:3000/auctions/${auctionId}`);
  });

  it("emails AUCTION_WON using the auction currency", async () => {
    const user = await insertUser(db, { name: "Cy" });
    await notifier.notify(user.id, event("AUCTION_WON"));
    expect(log.sent).toHaveLength(1);
    expect(log.sent[0]?.html).toContain(GEM_TITLE);
    expect(log.sent[0]?.text).toContain("$120.00");
  });

  it("now emails AUCTION_LOST (previously in-app only)", async () => {
    const user = await insertUser(db, { name: "Bea" });
    await notifier.notify(user.id, event("AUCTION_LOST"));
    expect(log.sent).toHaveLength(1);
    expect(log.sent[0]?.subject).toMatch(/ended/i);
  });

  it("no-ops (and never throws) for an unknown recipient", async () => {
    await expect(notifier.notify(MISSING_ID, event("AUCTION_WON"))).resolves.toBeUndefined();
    expect(log.sent).toHaveLength(0);
  });

  it("no-ops when the auction can't be found", async () => {
    const user = await insertUser(db);
    await notifier.notify(user.id, {
      type: "OUTBID",
      payload: { auctionId: MISSING_ID, amount: 1000, currency: "USD" },
      createdAt: new Date().toISOString(),
    });
    expect(log.sent).toHaveLength(0);
  });
});

describe("CompositeNotificationDispatcher", () => {
  it("keeps in-app (socket) delivery and ADDS email", () => {
    // Hold the mocks in locals so assertions don't reference interface methods
    // as unbound values (@typescript-eslint/unbound-method).
    const socketUserNotification = vi.fn();
    const socketAuctionClosed = vi.fn();
    const emailerNotify = vi.fn().mockResolvedValue(undefined);
    const socket = {
      auctionClosed: socketAuctionClosed,
      userNotification: socketUserNotification,
    } as unknown as SocketNotificationDispatcher;
    const emailer = { notify: emailerNotify } as unknown as EmailNotifier;
    const composite = new CompositeNotificationDispatcher(socket, emailer);

    const ev: UserNotificationEvent = {
      type: "AUCTION_WON",
      payload: { auctionId: "a1" },
      createdAt: new Date().toISOString(),
    };
    composite.userNotification("u1", ev);
    expect(socketUserNotification).toHaveBeenCalledWith("u1", ev); // in-app, unchanged
    expect(emailerNotify).toHaveBeenCalledWith("u1", ev); // email, additive

    const closed: AuctionClosedEvent = { auctionId: "a1", winnerId: "u1", finalAmount: 100 };
    composite.auctionClosed(closed);
    expect(socketAuctionClosed).toHaveBeenCalledWith(closed);
  });
});
