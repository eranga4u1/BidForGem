"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function Home(): React.ReactElement {
  const { status } = useAuth();
  return (
    <section className="hero">
      <div className="eyebrow">Live gem auctions</div>
      <h1>Discover extraordinary gems and bid in real time.</h1>
      <p className="muted" style={{ maxWidth: 560, marginTop: 14, fontSize: "1.05rem" }}>
        Vetted listings with certificates, transparent bidding, and anti-snipe protection. Every bid
        settles on the server — the countdown you see is the real one.
      </p>
      <div className="row" style={{ marginTop: 26, gap: 12 }}>
        <Link href="/gems" className="btn">
          Browse gems
        </Link>
        {status !== "authenticated" && (
          <Link href="/register" className="btn btn-ghost">
            Create account
          </Link>
        )}
      </div>
    </section>
  );
}
