"use client";

import type { BidHistoryItem, PublicAuction, PublicGem, PublicUser } from "@gem/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, tokens } from "@/lib/api";
import { GemApiError } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useAuctionSocket } from "@/lib/useAuctionSocket";
import { Countdown } from "./Countdown";
import { MediaGallery } from "./MediaGallery";

function bidErrorMessage(err: unknown, min: string): string {
  if (err instanceof GemApiError) {
    switch (err.code) {
      case "BID_TOO_LOW":
        return `Your bid is too low. Minimum is ${min}.`;
      case "AUCTION_ENDED":
        return "This auction has ended.";
      case "AUCTION_NOT_ACTIVE":
        return "This auction is not active yet.";
      case "SELF_BID_FORBIDDEN":
        return "You can’t bid on your own gem.";
      case "ALREADY_HIGHEST_BIDDER":
        return "You’re already the highest bidder.";
      case "MISSING_TOKEN":
      case "TOKEN_EXPIRED":
        return "Please sign in to bid.";
      default:
        return err.message;
    }
  }
  return "Could not place bid.";
}

let localBidSeq = 0;

export function AuctionRoom({
  auction: initial,
  gem,
  user,
}: {
  auction: PublicAuction;
  gem: PublicGem;
  user: PublicUser | null;
}): React.ReactElement {
  const [auction, setAuction] = useState<PublicAuction>(initial);
  const [history, setHistory] = useState<BidHistoryItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [amount, setAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  const ended =
    auction.status === "closed" || auction.status === "sold" || auction.status === "canceled";
  const minNext =
    auction.highestBid === null ? auction.startPrice : auction.highestBid + auction.minIncrement;
  const minLabel = formatMoney(minNext, auction.currency);
  const isSeller = user?.id === gem.sellerId;

  const sync = useCallback(async () => {
    try {
      const [a, h] = await Promise.all([
        api.auctions.get(auction.id),
        api.auctions.bids(auction.id, { limit: 20 }),
      ]);
      setAuction(a);
      setHistory(h.items);
    } catch {
      /* transient; next event or reconnect will re-sync */
    }
  }, [auction.id]);

  useEffect(() => {
    void sync();
  }, [sync]);

  useAuctionSocket(auction.id, {
    token: tokens.access,
    onConnectionChange: setConnected,
    onSync: () => void sync(),
    onBid: (e) => {
      setAuction((prev) => ({
        ...prev,
        highestBid: e.highestBid,
        bidCount: e.bidCount,
        endAt: new Date(e.endAt),
      }));
      setHistory((prev) =>
        [
          {
            id: `live-${++localBidSeq}`,
            amount: e.amount,
            bidderDisplayName: e.bidderDisplayName,
            createdAt: new Date(),
          },
          ...prev,
        ].slice(0, 20),
      );
    },
    onExtended: (e) => setAuction((prev) => ({ ...prev, endAt: new Date(e.endAt) })),
    onClosed: (e) =>
      setAuction((prev) => ({
        ...prev,
        status: e.winnerId ? "sold" : "closed",
        highestBid: e.finalAmount ?? prev.highestBid,
      })),
  });

  async function placeBid(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const value = Math.round(Number(amount) * 100);
    if (!Number.isFinite(value) || value <= 0) return;
    setBidError(null);
    setPlacing(true);
    const snapshot = auction;
    // Optimistic: reflect the bidder's own action immediately.
    setAuction((prev) => ({ ...prev, highestBid: value, bidCount: prev.bidCount + 1 }));
    try {
      const updated = await api.auctions.placeBid(auction.id, value);
      setAuction(updated);
      setAmount("");
    } catch (err) {
      // Server is authoritative — roll back and show why.
      setAuction(snapshot);
      setBidError(bidErrorMessage(err, minLabel));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="stack">
      <Link href={`/gems/${gem.id}`} className="faint">
        ← {gem.title}
      </Link>
      <div
        className="grid-2"
        style={{ gridTemplateColumns: "1.1fr 1fr", alignItems: "start", gap: 24 }}
      >
        <MediaGallery gemId={gem.id} media={gem.media} authenticated={Boolean(user)} />

        <div className="stack">
          <div className="row between">
            <div>
              <h1 style={{ marginBottom: 2 }}>{gem.title}</h1>
              <div className="muted">
                {gem.type} · {gem.carat} ct
              </div>
            </div>
            <span
              className={`pill ${ended ? (auction.status === "sold" ? "sold" : "") : "live dot"}`}
            >
              {ended ? auction.status : "live"}
            </span>
          </div>

          <div className="card">
            <div className="row between wrap" style={{ gap: 16 }}>
              <div className="stat">
                <span className="k">Current bid</span>
                <span className="big-money" data-testid="current-bid">
                  {auction.highestBid === null
                    ? formatMoney(auction.startPrice, auction.currency)
                    : formatMoney(auction.highestBid, auction.currency)}
                </span>
                <span className="faint" data-testid="bid-count">
                  {auction.bidCount} bid{auction.bidCount === 1 ? "" : "s"}
                  {auction.highestBid === null ? " · start price" : ""}
                </span>
              </div>
              <div className="stat" style={{ alignItems: "flex-end" }}>
                <span className="k">{ended ? "Auction" : "Ends in"}</span>
                <Countdown endAt={auction.endAt} ended={ended} />
                <span className={`conn ${connected ? "on" : ""}`}>
                  <span className="dot" />
                  {connected ? "Live" : "Reconnecting…"}
                </span>
              </div>
            </div>

            <div className="divider" style={{ margin: "16px 0" }} />

            {ended ? (
              <div className={auction.status === "sold" ? "success" : "notice"}>
                {auction.status === "sold"
                  ? `Sold for ${formatMoney(auction.highestBid ?? 0, auction.currency)}.`
                  : auction.status === "canceled"
                    ? "This auction was canceled."
                    : "Ended with no sale (reserve not met or no bids)."}
              </div>
            ) : !user ? (
              <div className="notice">
                <Link href="/login" style={{ color: "inherit", textDecoration: "underline" }}>
                  Sign in
                </Link>{" "}
                to place a bid.
              </div>
            ) : isSeller ? (
              <div className="notice">You can’t bid on your own gem.</div>
            ) : (
              <form onSubmit={(e) => void placeBid(e)}>
                <label>
                  Your bid ({auction.currency}) — min {minLabel}
                </label>
                <div className="row" style={{ gap: 10 }}>
                  <input
                    inputMode="decimal"
                    placeholder={(minNext / 100).toFixed(2)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-label="Bid amount"
                  />
                  <button className="btn" disabled={placing} type="submit">
                    {placing ? "Placing…" : "Place bid"}
                  </button>
                </div>
                {bidError && (
                  <div className="error" style={{ marginTop: 10 }} role="alert">
                    {bidError}
                  </div>
                )}
              </form>
            )}
          </div>

          <div className="card">
            <h3>Bid history</h3>
            {history.length === 0 ? (
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                No bids yet — be the first.
              </p>
            ) : (
              <div>
                {history.map((b) => (
                  <div className="bid-row" key={b.id}>
                    <span>{b.bidderDisplayName}</span>
                    <span className="mono">{formatMoney(b.amount, auction.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
