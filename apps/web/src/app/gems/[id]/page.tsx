"use client";

import type { PublicGem } from "@gem/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MediaGallery } from "@/components/MediaGallery";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function GemDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const [gem, setGem] = useState<PublicGem | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    api.gems
      .get(id)
      .then((g) => {
        if (active) {
          setGem(g);
          setState("ready");
        }
      })
      .catch(() => active && setState("error"));
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
