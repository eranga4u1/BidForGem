"use client";

import type { MediaType, PostingFee, PublicGem } from "@gem/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { GemApiError, useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { uploadToStorage } from "@/lib/upload";

type PublishState =
  | { kind: "idle" }
  | { kind: "blocked"; fee: PostingFee; ref: string }
  | { kind: "error"; message: string };

export default function EditGemPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, status } = useAuth();

  const [gem, setGem] = useState<PublicGem | null>(null);
  const [pageState, setPageState] = useState<"loading" | "ready" | "error">("loading");

  const reload = useCallback(async () => {
    const g = await api.gems.get(id);
    setGem(g);
    setPageState("ready");
  }, [id]);

  useEffect(() => {
    // Wait for auth to resolve: a draft is only readable by its owner, and the
    // access token is restored asynchronously on a fresh load. Fetching before
    // then would go out anonymous and 404 the owner's own draft.
    if (status === "loading") return;
    if (status === "anonymous") {
      router.replace("/login");
      return;
    }
    let active = true;
    setPageState("loading");
    api.gems
      .get(id)
      .then((g) => active && (setGem(g), setPageState("ready")))
      .catch(() => active && setPageState("error"));
    return () => {
      active = false;
    };
  }, [id, status, router]);

  if (pageState === "loading") {
    return (
      <div className="center-page">
        <span className="spinner" />
      </div>
    );
  }
  if (pageState === "error" || !gem) return <div className="error">Listing not found.</div>;
  if (user && gem.sellerId !== user.id) {
    return <div className="error">You can only manage your own listings.</div>;
  }

  return (
    <div className="stack" style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href={`/gems/${gem.id}`} className="faint">
        ← View listing
      </Link>
      <div className="row between wrap">
        <div>
          <div className="eyebrow">Manage listing</div>
          <h1 style={{ marginBottom: 2 }}>{gem.title}</h1>
        </div>
        <span
          className={`pill ${gem.status === "sold" ? "sold" : gem.status === "active" ? "live dot" : ""}`}
        >
          {gem.status}
        </span>
      </div>

      <PropertiesSection gem={gem} onSaved={reload} />
      <MediaSection gem={gem} onChanged={reload} />
      {gem.status === "draft" && <PublishSection gem={gem} onPublished={reload} />}
      {gem.status === "active" && <StartAuctionSection gem={gem} />}
      <DeleteSection gem={gem} onDeleted={() => router.push("/gems")} />
    </div>
  );
}

function PropertiesSection({
  gem,
  onSaved,
}: {
  gem: PublicGem;
  onSaved: () => Promise<void>;
}): React.ReactElement {
  const [f, setF] = useState({
    title: gem.title,
    type: gem.type,
    carat: String(gem.carat),
    color: gem.color ?? "",
    clarity: gem.clarity ?? "",
    cut: gem.cut ?? "",
    origin: gem.origin ?? "",
    description: gem.description ?? "",
  });
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await api.gems.update(gem.id, {
        title: f.title,
        type: f.type,
        carat: Number(f.carat),
        color: f.color || undefined,
        clarity: f.clarity || undefined,
        cut: f.cut || undefined,
        origin: f.origin || undefined,
        description: f.description || undefined,
      });
      await onSaved();
      setMsg({ kind: "success", text: "Saved." });
    } catch (err) {
      setMsg({
        kind: "error",
        text:
          err instanceof GemApiError && err.code === "GEM_NOT_EDITABLE"
            ? "This listing is live (it has bids or an active auction) and can no longer be edited."
            : "Could not save changes.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={(e) => void save(e)}>
      <h3>Properties</h3>
      <div className="field">
        <label>Title</label>
        <input value={f.title} onChange={set("title")} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Type</label>
          <input value={f.type} onChange={set("type")} />
        </div>
        <div className="field">
          <label>Carat</label>
          <input value={f.carat} onChange={set("carat")} inputMode="decimal" />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Color</label>
          <input value={f.color} onChange={set("color")} />
        </div>
        <div className="field">
          <label>Clarity</label>
          <input value={f.clarity} onChange={set("clarity")} />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Cut</label>
          <input value={f.cut} onChange={set("cut")} />
        </div>
        <div className="field">
          <label>Origin</label>
          <input value={f.origin} onChange={set("origin")} />
        </div>
      </div>
      <div className="field">
        <label>Description</label>
        <textarea value={f.description} onChange={set("description")} rows={3} />
      </div>
      {msg && (
        <div className={msg.kind === "error" ? "error" : "success"} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}
      <button className="btn" style={{ marginTop: 14 }} disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function MediaSection({
  gem,
  onChanged,
}: {
  gem: PublicGem;
  onChanged: () => Promise<void>;
}): React.ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<MediaType>("photo");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = gem.media.filter((m) => m.status === "ready");

  async function onUpload(): Promise<void> {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const ticket = await api.media.requestUpload(gem.id, {
        type,
        mime: file.type,
        sizeBytes: file.size,
        filename: file.name,
      });
      await uploadToStorage(ticket.url, file, file.type, setProgress);
      await api.media.complete(gem.id, ticket.mediaId);
      if (fileRef.current) fileRef.current.value = "";
      await onChanged();
    } catch (err) {
      setError(
        err instanceof GemApiError
          ? err.code === "UNSUPPORTED_MEDIA_TYPE"
            ? "That file type isn’t allowed for this media type."
            : err.code === "FILE_TOO_LARGE"
              ? "That file is too large."
              : err.code === "MEDIA_LIMIT_REACHED"
                ? "You’ve reached the media limit for this type."
                : err.message
          : "Upload failed.",
      );
    } finally {
      setProgress(null);
    }
  }

  async function remove(mediaId: string): Promise<void> {
    try {
      await api.media.remove(gem.id, mediaId);
      await onChanged();
    } catch {
      setError("Could not remove that item.");
    }
  }

  return (
    <div className="card">
      <h3>Media</h3>
      <p className="hint">
        Photos and video are public. Certificates are shown only via signed links.
      </p>
      {ready.length > 0 && (
        <div className="thumbs" style={{ marginTop: 6 }}>
          {ready.map((m) => (
            <div key={m.id} className="thumb" style={{ cursor: "default" }}>
              {m.type === "photo" && m.url ? (
                <img src={m.url} alt="" />
              ) : (
                <span className="badge-vid" style={{ position: "static" }}>
                  {m.type}
                </span>
              )}
              <button
                type="button"
                onClick={() => void remove(m.id)}
                title="Remove"
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 18,
                  height: 18,
                  padding: 0,
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.65)",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="row wrap" style={{ marginTop: 12, gap: 10 }}>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as MediaType)}
          style={{ width: "auto" }}
        >
          <option value="photo">Photo</option>
          <option value="video">Video</option>
          <option value="certificate">Certificate</option>
        </select>
        <input ref={fileRef} type="file" style={{ width: "auto", flex: 1 }} />
        <button
          type="button"
          className="btn btn-sm"
          disabled={progress !== null}
          onClick={() => void onUpload()}
        >
          {progress !== null ? `Uploading ${progress}%` : "Upload"}
        </button>
      </div>
      {progress !== null && (
        <div className="progress" style={{ marginTop: 10 }}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && (
        <div className="error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function PublishSection({
  gem,
  onPublished,
}: {
  gem: PublicGem;
  onPublished: () => Promise<void>;
}): React.ReactElement {
  const [state, setState] = useState<PublishState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  async function publish(): Promise<void> {
    setBusy(true);
    setState({ kind: "idle" });
    try {
      await api.gems.publish(gem.id);
      await onPublished();
    } catch (err) {
      if (err instanceof GemApiError && err.code === "POSTING_FEE_REQUIRED") {
        const d = err.details as { fee: PostingFee; paymentIntentRef: string };
        setState({ kind: "blocked", fee: d.fee, ref: d.paymentIntentRef });
      } else {
        setState({ kind: "error", message: "Could not publish. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Publish</h3>
      <p className="hint">Publishing makes this listing public and biddable.</p>
      {state.kind === "blocked" ? (
        <div className="notice" style={{ marginTop: 10 }}>
          <strong>Payment required to publish</strong>
          <div style={{ marginTop: 6 }}>
            A posting fee of <strong>{formatMoney(state.fee.amount, state.fee.currency)}</strong> is
            required to go live. Payment isn’t wired up yet — this listing stays a draft until it’s
            paid.
          </div>
          <div className="faint" style={{ marginTop: 6, fontSize: "0.78rem" }}>
            Payment intent: <span className="mono">{state.ref}</span>
          </div>
        </div>
      ) : state.kind === "error" ? (
        <div className="error" style={{ marginTop: 10 }}>
          {state.message}
        </div>
      ) : null}
      <button
        className="btn"
        style={{ marginTop: 14 }}
        disabled={busy}
        onClick={() => void publish()}
      >
        {busy ? "Publishing…" : "Publish listing"}
      </button>
    </div>
  );
}

// Duration presets (seconds). The SERVER computes the deadline from its own
// clock — the client only chooses how long the auction should run.
const DURATION_PRESETS: { label: string; seconds: number }[] = [
  { label: "1 hour", seconds: 3_600 },
  { label: "6 hours", seconds: 21_600 },
  { label: "12 hours", seconds: 43_200 },
  { label: "1 day", seconds: 86_400 },
  { label: "3 days", seconds: 259_200 },
  { label: "7 days", seconds: 604_800 },
  { label: "14 days", seconds: 1_209_600 },
  { label: "30 days", seconds: 2_592_000 },
];

function StartAuctionSection({ gem }: { gem: PublicGem }): React.ReactElement {
  const router = useRouter();
  const [f, setF] = useState({
    startPrice: "",
    reserve: "",
    minIncrement: "5",
    durationSeconds: "86400",
    currency: "USD",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function start(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Send a DURATION, never an absolute end_at: the server owns the clock.
      const auction = await api.auctions.create({
        gemId: gem.id,
        startPrice: Math.round(Number(f.startPrice) * 100),
        reservePrice: f.reserve ? Math.round(Number(f.reserve) * 100) : undefined,
        minIncrement: Math.round(Number(f.minIncrement) * 100),
        currency: f.currency,
        durationSeconds: Number(f.durationSeconds),
      });
      router.push(`/auctions/${auction.id}`);
    } catch (err) {
      setError(
        err instanceof GemApiError
          ? err.code === "AUCTION_ALREADY_EXISTS"
            ? "This gem already has a live auction."
            : err.code === "RESERVE_BELOW_START"
              ? "Reserve can’t be below the start price."
              : err.message
          : "Could not start the auction.",
      );
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={(e) => void start(e)}>
      <h3>Start an auction</h3>
      <p className="hint">Prices are in {f.currency}. The server drives the countdown and close.</p>
      <div className="grid-2">
        <div className="field">
          <label>Start price</label>
          <input
            value={f.startPrice}
            onChange={set("startPrice")}
            inputMode="decimal"
            placeholder="500"
            required
          />
        </div>
        <div className="field">
          <label>Reserve (optional)</label>
          <input
            value={f.reserve}
            onChange={set("reserve")}
            inputMode="decimal"
            placeholder="800"
          />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Min increment</label>
          <input
            value={f.minIncrement}
            onChange={set("minIncrement")}
            inputMode="decimal"
            required
          />
        </div>
        <div className="field">
          <label>Duration</label>
          <select value={f.durationSeconds} onChange={set("durationSeconds")} required>
            {DURATION_PRESETS.map((d) => (
              <option key={d.seconds} value={d.seconds}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      <button className="btn" style={{ marginTop: 14 }} disabled={busy}>
        {busy ? "Starting…" : "Start auction"}
      </button>
    </form>
  );
}

function DeleteSection({
  gem,
  onDeleted,
}: {
  gem: PublicGem;
  onDeleted: () => void;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.gems.remove(gem.id);
      onDeleted();
    } catch (err) {
      setError(
        err instanceof GemApiError && err.code === "GEM_NOT_EDITABLE"
          ? "A gem with bids or a live auction can’t be withdrawn."
          : "Could not delete.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="card">
      <h3>Danger zone</h3>
      {error && (
        <div className="error" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}
      <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => void remove()}>
        {busy ? "Removing…" : "Delete listing"}
      </button>
    </div>
  );
}
