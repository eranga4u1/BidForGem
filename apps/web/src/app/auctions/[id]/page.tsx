"use client";

import type { PublicAuction, PublicGem } from "@gem/types";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuctionRoom } from "@/components/AuctionRoom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AuctionPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const [data, setData] = useState<{ auction: PublicAuction; gem: PublicGem } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    (async () => {
      const auction = await api.auctions.get(id);
      const gem = await api.gems.get(auction.gemId);
      if (active) {
        setData({ auction, gem });
        setState("ready");
      }
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
  if (state === "error" || !data)
    return <div className="error">This auction couldn’t be found.</div>;

  return <AuctionRoom auction={data.auction} gem={data.gem} user={user} />;
}
