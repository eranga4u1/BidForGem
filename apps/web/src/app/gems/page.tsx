"use client";

import type { PublicGem } from "@gem/types";
import { useCallback, useEffect, useState } from "react";
import { GemCard } from "@/components/GemCard";
import { api } from "@/lib/api";

const LIMIT = 12;

type Filters = {
  type: string;
  color: string;
  clarity: string;
  cut: string;
  origin: string;
  caratMin: string;
  caratMax: string;
};
const EMPTY: Filters = {
  type: "",
  color: "",
  clarity: "",
  cut: "",
  origin: "",
  caratMin: "",
  caratMax: "",
};

export default function BrowsePage(): React.ReactElement {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<PublicGem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await api.gems.list({
        type: applied.type,
        color: applied.color,
        clarity: applied.clarity,
        cut: applied.cut,
        origin: applied.origin,
        caratMin: applied.caratMin,
        caratMax: applied.caratMax,
        limit: LIMIT,
        offset,
      });
      setItems(res.items);
      setHasMore(res.items.length === LIMIT);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [applied, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <div className="eyebrow">Marketplace</div>
          <h1>Browse gems</h1>
        </div>
      </div>

      <form
        className="card card-tight"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(draft);
        }}
      >
        <div
          className="gem-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}
        >
          <input placeholder="Type (e.g. ruby)" value={draft.type} onChange={set("type")} />
          <input placeholder="Color" value={draft.color} onChange={set("color")} />
          <input placeholder="Clarity" value={draft.clarity} onChange={set("clarity")} />
          <input placeholder="Cut" value={draft.cut} onChange={set("cut")} />
          <input placeholder="Origin" value={draft.origin} onChange={set("origin")} />
          <input
            placeholder="Min ct"
            inputMode="decimal"
            value={draft.caratMin}
            onChange={set("caratMin")}
          />
          <input
            placeholder="Max ct"
            inputMode="decimal"
            value={draft.caratMax}
            onChange={set("caratMax")}
          />
        </div>
        <div className="row" style={{ marginTop: 12, gap: 10 }}>
          <button type="submit" className="btn btn-sm">
            Apply filters
          </button>
          {applied !== EMPTY && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
                setOffset(0);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {state === "loading" ? (
        <div className="center-page">
          <span className="spinner" />
        </div>
      ) : state === "error" ? (
        <div className="error">Couldn’t load listings. Please try again.</div>
      ) : items.length === 0 ? (
        <div className="card center-page" style={{ minHeight: 180 }}>
          No gems match those filters.
        </div>
      ) : (
        <>
          <div className="gem-grid">
            {items.map((gem) => (
              <GemCard key={gem.id} gem={gem} />
            ))}
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
            >
              ← Previous
            </button>
            <span className="faint">Page {offset / LIMIT + 1}</span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={!hasMore}
              onClick={() => setOffset((o) => o + LIMIT)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
