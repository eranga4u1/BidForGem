import type { PublicGem } from "@gem/types";
import Link from "next/link";

export function GemCard({ gem }: { gem: PublicGem }): React.ReactElement {
  const photo = gem.media.find((m) => m.type === "photo" && m.status === "ready" && m.url);
  return (
    <Link href={`/gems/${gem.id}`} className="gem-card">
      <div className="gem-thumb">
        {photo ? <img src={photo.url ?? ""} alt={gem.title} /> : <div className="empty">💎</div>}
      </div>
      <div className="gem-card-body">
        <div className="row between">
          <span className="gem-card-title">{gem.title}</span>
          {gem.status !== "active" && (
            <span className={`pill ${gem.status === "sold" ? "sold" : ""}`}>{gem.status}</span>
          )}
        </div>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          {gem.type} · {gem.carat} ct{gem.color ? ` · ${gem.color}` : ""}
        </span>
      </div>
    </Link>
  );
}
