"use client";

import type { MyListing } from "@gem/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";

const GEM_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#9aa7ba" },
  active: { label: "Active", color: "#4fd1a1" },
  sold: { label: "Sold", color: "#e8c37a" },
  closed: { label: "Closed", color: "#9aa7ba" },
};

export default function MyListingsPage(): React.ReactElement {
  const { status } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<MyListing[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    setState("loading");
    api.gems
      .mine({ limit: 50 })
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
      <div className="row between wrap">
        <h1>My listings</h1>
        <Link href="/gems/new" className="btn btn-sm">
          + New listing
        </Link>
      </div>
      {state === "loading" ? (
        <div className="center-page">
          <span className="spinner" />
        </div>
      ) : state === "error" ? (
        <div className="error">Couldn’t load your listings. Please try again.</div>
      ) : items.length === 0 ? (
        <div className="card center-page" style={{ minHeight: 160 }}>
          You haven’t listed any gems yet.
        </div>
      ) : (
        <div className="stack" style={{ gap: 10, marginTop: 8 }}>
          {items.map(({ gem, auction }) => {
            const photo = gem.media.find(
              (m) => m.type === "photo" && m.status === "ready" && m.url,
            );
            const st = GEM_STATUS[gem.status] ?? { label: gem.status, color: "#9aa7ba" };
            return (
              <Link
                key={gem.id}
                href={auction ? `/auctions/${auction.id}` : `/gems/${gem.id}`}
                className="card row"
                style={{ gap: 12, alignItems: "center", textDecoration: "none" }}
              >
                <div className="thumb-sm">
                  {photo?.url ? (
                    <img src={photo.url} alt="" />
                  ) : (
                    <span className="thumb-glyph">◈</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{gem.title}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {gem.type} · {gem.carat} ct
                    {auction
                      ? ` · ${auction.bidCount} bid${auction.bidCount === 1 ? "" : "s"}`
                      : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className="pill" style={{ color: st.color, borderColor: st.color }}>
                    {st.label}
                  </span>
                  {auction && auction.highestBid !== null ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {formatMoney(auction.highestBid, auction.currency)}
                    </div>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
