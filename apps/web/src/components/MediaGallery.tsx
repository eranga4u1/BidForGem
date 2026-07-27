"use client";

import type { PublicMedia } from "@gem/types";
import { useState } from "react";
import { api } from "@/lib/api";

/**
 * Only 'ready' media renders. Photos/videos are shown inline; certificates are
 * NEVER a raw link — they sit behind a "View certificate" action that fetches a
 * short-lived signed URL on demand, offered only to authenticated users.
 */
export function MediaGallery({
  gemId,
  media,
  authenticated,
}: {
  gemId: string;
  media: PublicMedia[];
  authenticated: boolean;
}): React.ReactElement {
  const ready = media.filter((m) => m.status === "ready");
  const visual = ready.filter((m) => m.type === "photo" || m.type === "video");
  const certificates = ready.filter((m) => m.type === "certificate");
  const [active, setActive] = useState(0);
  const [cert, setCert] = useState<{ id: string; loading: boolean; error?: string } | null>(null);

  const current = visual[active];

  async function viewCertificate(id: string): Promise<void> {
    setCert({ id, loading: true });
    try {
      const { url } = await api.media.readUrl(gemId, id);
      window.open(url, "_blank", "noopener,noreferrer");
      setCert(null);
    } catch {
      setCert({ id, loading: false, error: "Could not load certificate." });
    }
  }

  return (
    <div>
      <div className="gallery-main">
        {!current ? (
          <div className="empty">💎</div>
        ) : current.type === "video" ? (
          <video src={current.url ?? ""} controls playsInline />
        ) : (
          <img src={current.url ?? ""} alt="" />
        )}
      </div>

      {visual.length > 1 && (
        <div className="thumbs">
          {visual.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`thumb ${i === active ? "active" : ""}`}
              onClick={() => setActive(i)}
              aria-label={m.type === "video" ? "Video" : "Photo"}
            >
              {m.type === "video" ? (
                <span className="badge-vid">▶ video</span>
              ) : (
                <img src={m.url ?? ""} alt="" />
              )}
            </button>
          ))}
        </div>
      )}

      {certificates.length > 0 && (
        <div className="card card-tight" style={{ marginTop: 14 }}>
          <div>
            <strong>Certificate{certificates.length > 1 ? "s" : ""}</strong>
            <div className="hint">Authenticity documents — access-controlled</div>
          </div>
          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            {certificates.map((c) => (
              <div className="row between" key={c.id}>
                <span className="muted">
                  {c.mime === "application/pdf" ? "PDF certificate" : "Certificate image"}
                </span>
                {authenticated ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={cert?.id === c.id && cert.loading}
                    onClick={() => void viewCertificate(c.id)}
                  >
                    {cert?.id === c.id && cert.loading ? "Loading…" : "View certificate"}
                  </button>
                ) : (
                  <span className="hint">Sign in to view</span>
                )}
              </div>
            ))}
          </div>
          {cert?.error && (
            <div className="error" style={{ marginTop: 10 }}>
              {cert.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
