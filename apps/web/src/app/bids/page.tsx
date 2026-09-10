"use client";

import type { MyBid } from "@gem/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";

const OUTCOME: Record<MyBid["outcome"], { label: string; color: string }> = {
  leading: { label: "Leading", color: "#4fd1a1" },
  won: { label: "Won", color: "#e8c37a" },
  outbid: { label: "Outbid", color: "#ffb454" },
  lost: { label: "Lost", color: "#ff6b6b" },
  ended: { label: "Ended", color: "#9aa7ba" },
};

export default function MyBidsPage(): React.ReactElement {
  const { status } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<MyBid[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    setState("loading");
    api.auctions
      .myBids({ limit: 50 })
      .then((r) => {
        if (active) {
          setItems(r.items);
          setState("ready");
        }
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [status]);

  if (status !== "authenticated") return <div className="center-page">Loading…</div>;

  return (
    <div className="narrow" style={{ margin: "8px auto 0" }}>
      <h1>My bids</h1>
      {state === "loading" ? (
        <div className="center-page">
          <span className="spinner" />
        </div>
      ) : state === "error" ? (
        <div className="error">Couldn’t load your bids. Please try again.</div>
      ) : items.length === 0 ? (
        <div className="card center-page" style={{ minHeight: 160 }}>
          You haven’t placed any bids yet.
        </div>
      ) : (
        <div className="stack" style={{ gap: 10, marginTop: 8 }}>
          {items.map((b) => {
            const o = OUTCOME[b.outcome];
            return (
              <Link
                key={b.auctionId}
                href={`/auctions/${b.auctionId}`}
                className="card row"
                style={{ gap: 12, alignItems: "center", textDecoration: "none" }}
              >
                <div className="thumb-sm">
                  {b.photoUrl ? (
                    <img src={b.photoUrl} alt="" />
                  ) : (
                    <span className="thumb-glyph">◈</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{b.gemTitle}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Your bid {formatMoney(b.myMaxBid, b.currency)} · Top{" "}
                    {b.highestBid !== null ? formatMoney(b.highestBid, b.currency) : "—"}
                  </div>
                </div>
                <span className="pill" style={{ color: o.color, borderColor: o.color }}>
                  {o.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
