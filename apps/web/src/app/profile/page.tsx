"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GemApiError, useAuth } from "@/lib/auth";

export default function ProfilePage(): React.ReactElement {
  const { user, status, updateName, logout, deleteAccount } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
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
            <span className="muted">Role</span>
            <span className="pill">{user.role}</span>
          </div>
        </dl>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Change display name</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setSaving(true);
            void updateName(name.trim()).finally(() => {
              setSaving(false);
              setName("");
            });
          }}
        >
          <input placeholder={user.name} value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className="btn btn-block"
            style={{ marginTop: 12 }}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>

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
