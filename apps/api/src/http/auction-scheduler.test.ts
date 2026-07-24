import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloseAuctionResult } from "../auctions/close-auction.js";
import { insertAuction, insertGem, insertUser, makeTestDb, type AnyDb } from "../test/harness.js";
import type { AuctionCloserService } from "./auctions/auction-closer.service.js";
import { AuctionScheduler } from "./auctions/auction-scheduler.service.js";

describe("AuctionScheduler.tick", () => {
  let db: AnyDb;
  let close: () => Promise<void>;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
  });
  afterEach(async () => {
    await close();
  });

  async function dueAuction(): Promise<string> {
    const seller = await insertUser(db);
    const gem = await insertGem(db, seller.id, { status: "active" });
    const now = Date.now();
    const auction = await insertAuction(db, gem.id, {
      status: "active",
      startAt: new Date(now - 7_200_000),
      endAt: new Date(now - 3_600_000),
    });
    return auction.id;
  }

  it("isolates failures: one auction throwing does not abort the rest of the batch", async () => {
    const idA = await dueAuction();
    const idBad = await dueAuction();
    const idB = await dueAuction();

    const calls: string[] = [];
    const ok: CloseAuctionResult = {
      ok: true,
      outcome: "closed",
      winnerId: null,
      finalAmount: null,
      sellerId: "seller",
      notifications: [],
    };
    const fakeCloser = {
      close: (id: string): Promise<CloseAuctionResult> => {
        calls.push(id);
        if (id === idBad) throw new Error("boom");
        return Promise.resolve(ok);
      },
    };

    const scheduler = new AuctionScheduler(db, fakeCloser as unknown as AuctionCloserService);
    const result = await scheduler.tick();

    // Every due auction was attempted despite one throwing.
    expect(calls.sort()).toEqual([idA, idB, idBad].sort());
    expect(result.failed).toBe(1);
    expect(result.closed).toBe(2);
  });
});
