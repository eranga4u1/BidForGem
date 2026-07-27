import type { PublicAuction, PublicGem, PublicUser } from "@gem/types";
import { GemApiError } from "@gem/api-client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Capture the socket handlers so tests can drive events; mock the API layer.
const store = vi.hoisted(() => ({
  handlers: { current: null as null | Record<string, (e: unknown) => void> },
  placeBid: vi.fn(),
  get: vi.fn(),
  bids: vi.fn(),
}));

vi.mock("@/lib/useAuctionSocket", () => ({
  useAuctionSocket: (_id: string | null, handlers: Record<string, (e: unknown) => void>) => {
    store.handlers.current = handlers;
  },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@gem/api-client")>("@gem/api-client");
  return {
    api: {
      auctions: { get: store.get, bids: store.bids, placeBid: store.placeBid },
      media: { readUrl: vi.fn() },
    },
    tokens: { access: "token", refresh: null },
    GemApiError: actual.GemApiError,
  };
});

import { AuctionRoom } from "./AuctionRoom";

const gem: PublicGem = {
  id: "gem-1",
  sellerId: "seller-1",
  title: "Blue Sapphire",
  description: null,
  type: "sapphire",
  caratMilli: 2500,
  carat: 2.5,
  color: null,
  clarity: null,
  cut: null,
  origin: null,
  status: "active",
  createdAt: new Date(),
  media: [],
};

function makeAuction(over: Partial<PublicAuction> = {}): PublicAuction {
  return {
    id: "auction-1",
    gemId: "gem-1",
    status: "active",
    currency: "USD",
    startPrice: 1000,
    reservePrice: null,
    minIncrement: 100,
    startAt: new Date(Date.now() - 60_000),
    endAt: new Date(Date.now() + 3_600_000),
    highestBid: 1000,
    bidCount: 1,
    antiSnipeWindowSeconds: 30,
    antiSnipeExtendSeconds: 60,
    ...over,
  };
}

const bidder: PublicUser = {
  id: "bidder-1",
  name: "Ada",
  email: "ada@example.com",
  role: "user",
  verified: false,
  createdAt: new Date(),
};

describe("AuctionRoom", () => {
  it("rolls back the optimistic bid and shows the reason when the server rejects", async () => {
    store.get.mockResolvedValue(makeAuction());
    store.bids.mockResolvedValue({ items: [], limit: 20, offset: 0 });
    store.placeBid.mockRejectedValue(new GemApiError(409, "BID_TOO_LOW", "too low"));

    render(<AuctionRoom auction={makeAuction()} gem={gem} user={bidder} />);

    // Current bid starts at $10.00.
    expect(screen.getByTestId("current-bid").textContent).toMatch(/10\.00/);

    fireEvent.change(screen.getByLabelText("Bid amount"), { target: { value: "5" } });
    fireEvent.submit(screen.getByLabelText("Bid amount").closest("form")!);

    // Rejection -> rollback to $10.00 and an error is shown.
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/too low/i));
    expect(screen.getByTestId("current-bid").textContent).toMatch(/10\.00/);
    expect(screen.getByTestId("bid-count").textContent).toMatch(/^1 bid/);
  });

  it("updates the view on a bid:placed socket event without refetching", async () => {
    store.get.mockResolvedValue(makeAuction());
    store.bids.mockResolvedValue({ items: [], limit: 20, offset: 0 });

    render(<AuctionRoom auction={makeAuction()} gem={gem} user={bidder} />);
    await waitFor(() => expect(store.get).toHaveBeenCalled());
    store.get.mockClear();

    act(() => {
      store.handlers.current?.onBid?.({
        auctionId: "auction-1",
        amount: 2000,
        bidderDisplayName: "Grace",
        highestBid: 2000,
        bidCount: 2,
        endAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
    });

    expect(screen.getByTestId("current-bid").textContent).toMatch(/20\.00/);
    expect(screen.getByTestId("bid-count").textContent).toMatch(/^2 bids/);
    expect(screen.getByText("Grace")).toBeTruthy();
    // No refetch was triggered by the event.
    expect(store.get).not.toHaveBeenCalled();
  });
});
