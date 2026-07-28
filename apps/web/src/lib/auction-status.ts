import type { PublicAuction } from "@gem/types";

/**
 * What the gem page should show about a gem's auction. Derived purely from the
 * SERVER's auction status — never from a client-side time comparison (consistent
 * with the server-authoritative deadline).
 *
 *  - `active`    → biddable now; link to the auction / place-bid page.
 *  - `scheduled` → created but not started; link, but bidding isn't open yet.
 *  - `ended`     → terminal (sold / closed / canceled); show the outcome.
 *  - `none`      → the gem has no auction.
 */
export type GemAuctionView =
  | { kind: "active"; auction: PublicAuction }
  | { kind: "scheduled"; auction: PublicAuction }
  | { kind: "ended"; auction: PublicAuction }
  | { kind: "none" };

const NON_TERMINAL = new Set(["scheduled", "active"]);

/**
 * Pick the auction a gem page should surface from all of the gem's auctions.
 * A gem has at most one non-terminal (scheduled/active) auction — prefer it;
 * otherwise fall back to the most recently ended one so the page can show the
 * outcome instead of a dead end.
 */
export function currentAuctionView(auctions: PublicAuction[]): GemAuctionView {
  const live = auctions.find((a) => NON_TERMINAL.has(a.status));
  if (live) {
    return { kind: live.status === "active" ? "active" : "scheduled", auction: live };
  }
  const latestEnded = auctions
    .filter((a) => !NON_TERMINAL.has(a.status))
    .sort((a, b) => b.endAt.getTime() - a.endAt.getTime())[0];
  return latestEnded ? { kind: "ended", auction: latestEnded } : { kind: "none" };
}
