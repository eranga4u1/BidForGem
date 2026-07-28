"use client";

import type { PublicGem } from "@gem/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Countdown } from "@/components/Countdown";
import { MediaGallery } from "@/components/MediaGallery";
import { api } from "@/lib/api";
import { currentAuctionView, type GemAuctionView } from "@/lib/auction-status";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";

export default function GemDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const [gem, setGem] = useState<PublicGem | null>(null);
  const [auctionView, setAuctionView] = useState<GemAuctionView>({ kind: "none" });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    void (async () => {
      // Gem details and the gem's auctions in parallel — both keyed only by id.
      const [g, auctions] = await Promise.all([
        api.gems.get(id),
        api.auctions.list({ gemId: id, limit: 50 }),
      ]);
      if (!active) return;
      setGem(g);
      setAuctionView(currentAuctionView(auctions.items));
      setState("ready");
    })().catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [id]);

  if (state === "loading") {
    return (
      <div className="center-page">
        <span className="spinner" />
      </div>
    );
  }
  if (state === "error" || !gem) {
    return <div className="error">This gem couldn’t be found.</div>;
  }

  const owner = user?.id === gem.sellerId;
  const rows: [string, string][] = [
    ["Type", gem.type],
    ["Carat", `${gem.carat} ct`],
    ...(gem.color ? ([["Color", gem.color]] as [string, string][]) : []),
    ...(gem.clarity ? ([["Clarity", gem.clarity]] as [string, string][]) : []),
    ...(gem.cut ? ([["Cut", gem.cut]] as [string, string][]) : []),
    ...(gem.origin ? ([["Origin", gem.origin]] as [string, string][]) : []),
  ];

  return (
    <div className="stack">
      <Link href="/gems" className="faint">
        ← Back to browse
      </Link>
      <div
        className="grid-2"
        style={{ gridTemplateColumns: "1.15fr 1fr", alignItems: "start", gap: 24 }}
      >
        <MediaGallery gemId={gem.id} media={gem.media} authenticated={Boolean(user)} />
        <div className="stack">
          <div>
            <div className="row between">
              <h1 style={{ marginBottom: 2 }}>{gem.title}</h1>
              {gem.status !== "active" && (
                <span className={`pill ${gem.status === "sold" ? "sold" : ""}`}>{gem.status}</span>
              )}
            </div>
            <div className="muted">
              {gem.type} · {gem.carat} ct
            </div>
          </div>
          {gem.description && <p className="muted">{gem.description}</p>}

          <AuctionAffordance view={auctionView} isOwner={owner} />

          <div className="card card-tight">
            <div className="stack" style={{ gap: 9 }}>
              {rows.map(([k, v]) => (
                <div className="row between" key={k}>
                  <span className="muted">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>
          {owner && (
            <Link href={`/gems/${gem.id}/edit`} className="btn btn-block">
              Manage listing
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Bridges a gem to its auction. Derived entirely from the SERVER's auction
 * status — no client time math decides whether bidding is open. Never dangles a
 * "place bid" entry point at the seller (the self-bid guard is server-side, but
 * the UI shouldn't imply a form they can't use).
 */
function AuctionAffordance({
  view,
  isOwner,
}: {
  view: GemAuctionView;
  isOwner: boolean;
}): React.ReactElement | null {
  if (view.kind === "active") {
    const a = view.auction;
    return (
      <div className="card">
        <div className="row between">
          <span className="k">Current bid</span>
          <span className="pill live dot">live</span>
        </div>
        <div className="big-money" style={{ margin: "4px 0" }}>
          {formatMoney(a.highestBid ?? a.startPrice, a.currency)}
        </div>
        <div className="faint">
          {a.bidCount} bid{a.bidCount === 1 ? "" : "s"} · ends in <Countdown endAt={a.endAt} />
        </div>
        <Link href={`/auctions/${a.id}`} className="btn btn-block" style={{ marginTop: 12 }}>
          {isOwner ? "View auction" : "View live auction · Place bid"}
        </Link>
      </div>
    );
  }

  if (view.kind === "scheduled") {
    const a = view.auction;
    return (
      <div className="card">
        <div className="row between">
          <span className="k">Auction scheduled</span>
          <span className="pill">scheduled</span>
        </div>
        <div className="faint" style={{ marginTop: 4 }}>
          Bidding opens {new Date(a.startAt).toLocaleString()}
        </div>
        <Link
          href={`/auctions/${a.id}`}
          className="btn btn-block btn-ghost"
          style={{ marginTop: 12 }}
        >
          View auction
        </Link>
      </div>
    );
  }

  if (view.kind === "ended") {
    const a = view.auction;
    const outcome =
      a.status === "sold"
        ? `Sold for ${formatMoney(a.highestBid ?? 0, a.currency)}`
        : a.status === "canceled"
          ? "Auction canceled"
          : "Auction ended — no sale";
    return (
      <div className="card">
        <div className="row between">
          <span className="k">Auction {a.status}</span>
        </div>
        <div className="faint" style={{ marginTop: 4 }}>
          {outcome}
        </div>
        <Link
          href={`/auctions/${a.id}`}
          className="faint"
          style={{ marginTop: 10, display: "inline-block" }}
        >
          View result →
        </Link>
      </div>
    );
  }

  // No auction yet. The seller's start-an-auction path is the "Manage listing"
  // button below; a buyer just sees that it isn't up for auction.
  if (isOwner) return null;
  return (
    <div className="card">
      <div className="faint">Not yet up for auction.</div>
    </div>
  );
}
