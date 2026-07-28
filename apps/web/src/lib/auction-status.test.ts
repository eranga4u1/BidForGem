import type { PublicAuction } from "@gem/types";
import { describe, expect, it } from "vitest";
import { currentAuctionView } from "./auction-status";

function auction(over: Partial<PublicAuction>): PublicAuction {
  return {
    id: over.id ?? "a1",
    gemId: "g1",
    status: over.status ?? "active",
    currency: "USD",
    startPrice: 10000,
    reservePrice: null,
    minIncrement: 1000,
    startAt: over.startAt ?? new Date("2026-01-01T00:00:00Z"),
    endAt: over.endAt ?? new Date("2026-01-01T01:00:00Z"),
    highestBid: over.highestBid ?? null,
    bidCount: 0,
    antiSnipeWindowSeconds: 30,
    antiSnipeExtendSeconds: 60,
    ...over,
  };
}

describe("currentAuctionView", () => {
  it("surfaces an active auction as biddable", () => {
    const view = currentAuctionView([auction({ id: "live", status: "active" })]);
    expect(view.kind).toBe("active");
    if (view.kind === "active") expect(view.auction.id).toBe("live");
  });

  it("surfaces a scheduled auction as not-yet-open", () => {
    const view = currentAuctionView([auction({ id: "s", status: "scheduled" })]);
    expect(view.kind).toBe("scheduled");
  });

  it("prefers the non-terminal auction over an earlier terminal one", () => {
    const view = currentAuctionView([
      auction({ id: "old", status: "closed", endAt: new Date("2026-01-01T01:00:00Z") }),
      auction({ id: "live", status: "active", endAt: new Date("2026-02-01T01:00:00Z") }),
    ]);
    expect(view.kind).toBe("active");
    if (view.kind === "active") expect(view.auction.id).toBe("live");
  });

  it("shows the most recently ended auction when none is live", () => {
    const view = currentAuctionView([
      auction({ id: "older", status: "closed", endAt: new Date("2026-01-01T00:00:00Z") }),
      auction({ id: "newer", status: "sold", endAt: new Date("2026-03-01T00:00:00Z") }),
    ]);
    expect(view.kind).toBe("ended");
    if (view.kind === "ended") expect(view.auction.id).toBe("newer");
  });

  it("returns none when the gem has no auction", () => {
    expect(currentAuctionView([])).toEqual({ kind: "none" });
  });
});
