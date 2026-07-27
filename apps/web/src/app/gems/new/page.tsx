"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { GemApiError, useAuth } from "@/lib/auth";

export default function NewGemPage(): React.ReactElement {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  const [f, setF] = useState({
    title: "",
    type: "",
    carat: "",
    color: "",
    clarity: "",
    cut: "",
    origin: "",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const gem = await api.gems.create({
        title: f.title,
        type: f.type,
        carat: Number(f.carat),
        color: f.color || undefined,
        clarity: f.clarity || undefined,
        cut: f.cut || undefined,
        origin: f.origin || undefined,
        description: f.description || undefined,
      });
      router.push(`/gems/${gem.id}/edit`);
    } catch (err) {
      setError(
        err instanceof GemApiError
          ? err.code === "INVALID_INPUT"
            ? "Please check the fields — title, type, and a positive carat are required."
            : err.message
          : "Something went wrong.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <div className="eyebrow">New listing</div>
      <h1>List a gem</h1>
      <p className="muted">Create a draft — you can add photos and publish next.</p>
      <form className="card" style={{ marginTop: 16 }} onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label>Title</label>
          <input
            value={f.title}
            onChange={set("title")}
            placeholder="Ceylon Blue Sapphire"
            required
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Type</label>
            <input value={f.type} onChange={set("type")} placeholder="sapphire" required />
          </div>
          <div className="field">
            <label>Carat</label>
            <input
              value={f.carat}
              onChange={set("carat")}
              inputMode="decimal"
              placeholder="2.5"
              required
            />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Color</label>
            <input value={f.color} onChange={set("color")} placeholder="Royal blue" />
          </div>
          <div className="field">
            <label>Clarity</label>
            <input value={f.clarity} onChange={set("clarity")} placeholder="VS" />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Cut</label>
            <input value={f.cut} onChange={set("cut")} placeholder="Oval" />
          </div>
          <div className="field">
            <label>Origin</label>
            <input value={f.origin} onChange={set("origin")} placeholder="Sri Lanka" />
          </div>
        </div>
        <div className="field">
          <label>Description</label>
          <textarea
            value={f.description}
            onChange={set("description")}
            rows={3}
            placeholder="Notable characteristics…"
          />
        </div>
        {error && (
          <div className="error" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
        <button className="btn btn-block" style={{ marginTop: 16 }} disabled={busy}>
          {busy ? "Creating…" : "Create draft"}
        </button>
      </form>
    </div>
  );
}
