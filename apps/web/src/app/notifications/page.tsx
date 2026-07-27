"use client";

import type { PublicNotification } from "@gem/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, tokens } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAuctionSocket } from "@/lib/useAuctionSocket";

const LABELS: Record<string, { icon: string; text: string }> = {
  OUTBID: { icon: "⚡", text: "You were outbid" },
  AUCTION_WON: { icon: "🏆", text: "You won the auction" },
  AUCTION_SOLD: { icon: "💰", text: "Your gem sold" },
  AUCTION_LOST: { icon: "•", text: "Auction lost" },
  AUCTION_ENDED_NO_SALE: { icon: "⏳", text: "Auction ended — no sale" },
};

export default function NotificationsPage(): React.ReactElement {
  const { status } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<PublicNotification[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  const load = useCallback(async () => {
    try {
      const r = await api.notifications.list({ limit: 50 });
      setItems(r.items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load]);

  // Live OUTBID / AUCTION_WON via the user-scoped socket event.
  useAuctionSocket(null, { token: tokens.access, onNotification: () => void load() });

  const unread = items.filter((n) => n.readAt === null).length;

  async function markRead(id: string): Promise<void> {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n)));
    await api.notifications.markRead(id).catch(() => undefined);
  }
  async function markAll(): Promise<void> {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })));
    await api.notifications.markAllRead().catch(() => undefined);
  }

  return (
    <div className="stack" style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="row between">
        <div>
          <div className="eyebrow">Activity</div>
          <h1>Notifications</h1>
        </div>
        {unread > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => void markAll()}>
            Mark all read
          </button>
        )}
      </div>

      {state === "loading" ? (
        <div className="center-page">
          <span className="spinner" />
        </div>
      ) : state === "error" ? (
        <div className="error">Couldn’t load notifications.</div>
      ) : items.length === 0 ? (
        <div className="card center-page" style={{ minHeight: 140 }}>
          Nothing yet.
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {items.map((n) => {
            const meta = LABELS[n.type] ?? { icon: "•", text: n.type };
            const auctionId = typeof n.payload.auctionId === "string" ? n.payload.auctionId : null;
            return (
              <div key={n.id} className={`notif ${n.readAt === null ? "unread" : ""}`}>
                <div className="ic">{meta.icon}</div>
                <div style={{ flex: 1 }}>
                  <div className="row between">
                    <strong>{meta.text}</strong>
                    <span className="faint" style={{ fontSize: "0.76rem" }}>
                      {n.createdAt.toLocaleString()}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 12, marginTop: 4 }}>
                    {auctionId && (
                      <Link
                        href={`/auctions/${auctionId}`}
                        style={{ color: "var(--brand-2)", fontSize: "0.86rem" }}
                      >
                        View auction
                      </Link>
                    )}
                    {n.readAt === null && (
                      <button
                        className="faint"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "0.82rem",
                          padding: 0,
                        }}
                        onClick={() => void markRead(n.id)}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
