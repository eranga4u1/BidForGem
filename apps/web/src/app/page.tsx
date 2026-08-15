"use client";

import type { PublicAuction, PublicGem } from "@gem/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Countdown } from "@/components/Countdown";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";

interface Tile {
  auction: PublicAuction;
  gem: PublicGem | undefined;
}

export default function Home(): React.ReactElement {
  const { status } = useAuth();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [auctions, gems] = await Promise.all([
          api.auctions.list({ limit: 24 }),
          api.gems.list({ limit: 50 }),
        ]);
        if (!active) return;
        const byId = new Map(gems.items.map((g) => [g.id, g]));
        const live = auctions.items
          .filter((a) => a.status === "active" || a.status === "scheduled")
          .sort((a, b) => a.endAt.getTime() - b.endAt.getTime());
        setTiles(live.map((a) => ({ auction: a, gem: byId.get(a.gemId) })));
        setState("ready");
      } catch {
        if (active) setState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const liveCount = tiles.length;
  const totalBids = tiles.reduce((s, t) => s + t.auction.bidCount, 0);
  const topBid = tiles.reduce((m, t) => Math.max(m, t.auction.highestBid ?? 0), 0);
  const currency = tiles[0]?.auction.currency ?? "USD";

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Live gem auctions</div>
        <h1>Discover extraordinary gems and bid in real time.</h1>
        <p className="muted" style={{ maxWidth: 560, marginTop: 14, fontSize: "1.05rem" }}>
          Vetted listings with certificates, transparent bidding, and anti-snipe protection. Every
          bid settles on the server — the countdown you see is the real one.
        </p>
        <div className="row wrap" style={{ marginTop: 26, gap: 12 }}>
          <Link href="/gems" className="btn">
            Browse gems
          </Link>
          {status !== "authenticated" && (
            <Link href="/register" className="btn btn-ghost">
              Create account
            </Link>
          )}
        </div>
        {state === "ready" && liveCount > 0 && (
          <div className="hero-stats">
            <StatChip k="Live auctions" v={String(liveCount)} />
            <StatChip k="Total bids" v={String(totalBids)} />
            <StatChip k="Top bid" v={topBid > 0 ? formatMoney(topBid, currency) : "—"} />
          </div>
        )}
      </section>

      <section style={{ marginTop: 36 }}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <div className="row" style={{ gap: 10 }}>
            <h2 style={{ margin: 0 }}>Live now</h2>
            {liveCount > 0 && <span className="pill live dot">{liveCount} ongoing</span>}
          </div>
          <Link href="/gems" className="faint" style={{ fontSize: "0.9rem" }}>
            View all →
          </Link>
        </div>

        {state === "loading" ? (
          <div className="center-page">
            <span className="spinner" />
          </div>
        ) : state === "error" ? (
          <div className="error">Couldn’t load live auctions. Please try again.</div>
        ) : tiles.length === 0 ? (
          <div className="card center-page" style={{ minHeight: 140 }}>
            No live auctions right now — check back soon.
          </div>
        ) : (
          <div className="auction-tiles">
            {tiles.map((t) => (
              <AuctionTile key={t.auction.id} tile={t} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function StatChip({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <div className="stat-chip">
      <span className="v">{v}</span>
      <span className="k">{k}</span>
    </div>
  );
}

function AuctionTile({ tile }: { tile: Tile }): React.ReactElement {
  const { auction, gem } = tile;
  const photo = gem?.media.find((m) => m.type === "photo" && m.status === "ready" && m.url);
  const ended = auction.status !== "active" && auction.status !== "scheduled";
  const price =
    auction.highestBid === null
      ? formatMoney(auction.startPrice, auction.currency)
      : formatMoney(auction.highestBid, auction.currency);

  return (
    <Link href={`/auctions/${auction.id}`} className="atile">
      <div className="atile-media">
        {photo?.url ? (
          <img src={photo.url} alt={gem?.title ?? "Gem"} />
        ) : (
          <div className="empty">💎</div>
        )}
        <span className={`pill atile-pill ${ended ? "" : "live dot"}`}>
          {ended ? auction.status : "live"}
        </span>
      </div>
      <div className="atile-body">
        <div className="atile-title">{gem?.title ?? "Gem"}</div>
        <div className="faint" style={{ fontSize: "0.82rem" }}>
          {gem ? `${gem.type} · ${gem.carat} ct${gem.origin ? ` · ${gem.origin}` : ""}` : " "}
        </div>
        <div className="atile-foot">
          <div className="stat">
            <span className="k">{auction.highestBid === null ? "Start price" : "Current bid"}</span>
            <span className="atile-price">{price}</span>
            <span className="faint" style={{ fontSize: "0.76rem" }}>
              {auction.bidCount} bid{auction.bidCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="stat" style={{ alignItems: "flex-end" }}>
            <span className="k">{ended ? "Auction" : "Ends in"}</span>
            <Countdown endAt={auction.endAt} ended={ended} />
          </div>
        </div>
      </div>
    </Link>
  );
}
