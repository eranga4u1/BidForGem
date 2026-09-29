"use client";

import { phoneSchema } from "@gem/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GemApiError, useAuth } from "@/lib/auth";

/** Validate an optional phone field with the same rule the API enforces. */
function phoneError(value: string): string | null {
  if (!value.trim()) return null;
  return phoneSchema.safeParse(value).success
    ? null
    : "Use a phone number like 077 123 4567 or +94 77 123 4567.";
}

export default function ProfilePage(): React.ReactElement {
  const { user, status, updateProfile, logout, deleteAccount } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", phone: "", phone2: "" });
  const [saveMsg, setSaveMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onDelete(): Promise<void> {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount(password);
      router.replace("/");
    } catch (err) {
      setDeleteError(
        err instanceof GemApiError && err.code === "INVALID_CREDENTIALS"
          ? "Incorrect password."
          : "Couldn’t delete your account. Please try again.",
      );
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  // Prefill the form with the saved profile (and re-sync after each save).
  useEffect(() => {
    if (user) setForm({ name: user.name, phone: user.phone ?? "", phone2: user.phone2 ?? "" });
  }, [user]);

  async function onSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaveMsg(null);
    const invalid = phoneError(form.phone) ?? phoneError(form.phone2);
    if (!form.name.trim() || invalid) {
      setSaveMsg({ kind: "error", text: invalid ?? "Your name can’t be empty." });
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
        phone2: form.phone2.trim(),
      });
      setSaveMsg({ kind: "success", text: "Profile saved." });
    } catch (err) {
      setSaveMsg({
        kind: "error",
        text:
          err instanceof GemApiError && err.code === "INVALID_INPUT"
            ? "Please check your details and try again."
            : "Couldn’t save your profile. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (status !== "authenticated" || !user) {
    return <div className="center-page">Loading…</div>;
  }

  return (
    <div className="narrow" style={{ margin: "8px auto 0" }}>
      <h1>Your profile</h1>
      <div className="card" style={{ marginTop: 8 }}>
        <dl className="stack" style={{ gap: 10 }}>
          <div className="row between">
            <span className="muted">Name</span>
            <strong>{user.name}</strong>
          </div>
          <div className="row between">
            <span className="muted">Email</span>
            <span>{user.email}</span>
          </div>
          <div className="row between">
            <span className="muted">Contact</span>
            <span>
              {[user.phone, user.phone2].filter(Boolean).join(" · ") || (
                <span className="faint">Not set</span>
              )}
            </span>
          </div>
          <div className="row between">
            <span className="muted">Role</span>
            <span className="pill">{user.role}</span>
          </div>
        </dl>
      </div>

      <form className="card" style={{ marginTop: 16 }} onSubmit={(e) => void onSave(e)}>
        <h3>Edit profile</h3>
        <p className="hint">
          Signed-in buyers see your name and contact numbers on your listings. You need at least one
          number to publish a listing.
        </p>
        <div className="field">
          <label htmlFor="profile-name">Display name</label>
          <input
            id="profile-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="profile-phone">Contact number</label>
            <input
              id="profile-phone"
              type="tel"
              inputMode="tel"
              placeholder="077 123 4567"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="profile-phone2">Second number (optional)</label>
            <input
              id="profile-phone2"
              type="tel"
              inputMode="tel"
              placeholder="WhatsApp or land line"
              value={form.phone2}
              onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))}
            />
          </div>
        </div>
        {saveMsg && (
          <div className={saveMsg.kind} role={saveMsg.kind === "error" ? "alert" : "status"}>
            {saveMsg.text}
          </div>
        )}
        <button className="btn btn-block" style={{ marginTop: 12 }} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>

      <button
        className="btn btn-ghost btn-block"
        style={{ marginTop: 16 }}
        onClick={() => void logout()}
      >
        Sign out
      </button>

      <div className="card" style={{ marginTop: 24, borderColor: "var(--danger, #ff6b6b)" }}>
        <h3 style={{ color: "var(--danger, #ff6b6b)" }}>Delete account</h3>
        <p className="muted" style={{ marginTop: 4 }}>
          This permanently removes your personal data and signs you out everywhere. Your past bids
          stay on record as “Deleted user”. This can’t be undone.
        </p>
        {!confirming ? (
          <button
            className="btn btn-block"
            style={{ marginTop: 12, background: "var(--danger, #ff6b6b)", color: "#2a0a0a" }}
            onClick={() => setConfirming(true)}
          >
            Delete account
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (password) void onDelete();
            }}
            style={{ marginTop: 12 }}
          >
            <input
              type="password"
              placeholder="Confirm your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {deleteError ? (
              <p style={{ color: "var(--danger, #ff6b6b)", marginTop: 8 }}>{deleteError}</p>
            ) : null}
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                  setDeleteError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-block"
                style={{ background: "var(--danger, #ff6b6b)", color: "#2a0a0a" }}
                disabled={deleting || !password}
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
