"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { InstallButton } from "@/components/InstallButton";

function Brand(): React.ReactElement {
  return (
    <div className="topbar">
      <div className="brand">
        <img src="/icon.svg" alt="Gem" />
        <span>Gem</span>
      </div>
      <InstallButton />
    </div>
  );
}

export default function HomePage(): React.ReactElement {
  const { user, status, logout, updateName } = useAuth();
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  if (status === "loading") {
    return (
      <>
        <Brand />
        <div className="card">
          <p className="muted">Loading your session…</p>
        </div>
      </>
    );
  }

  if (status === "anonymous" || !user) {
    return (
      <>
        <Brand />
        <div className="card">
          <h1>Welcome to Gem 💎</h1>
          <p className="muted">
            Create a profile, list gems with photos and certificates, and bid in live auctions. Sign
            in to get started.
          </p>
          <Link href="/login" className="btn" style={{ textDecoration: "none" }}>
            Sign in
          </Link>
          <p className="center">
            New here?{" "}
            <Link href="/register" className="link">
              Create an account
            </Link>
          </p>
        </div>
        <div className="foot">Installable PWA · works offline</div>
      </>
    );
  }

  return (
    <>
      <Brand />
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ marginBottom: 0 }}>Hi, {user.name.split(" ")[0]} 👋</h1>
          <span className="badge">{user.role}</span>
        </div>
        <p className="muted">You are signed in.</p>
        <dl className="field-list">
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Verified</dt>
          <dd>{user.verified ? "yes" : "no"}</dd>
          <dt>User ID</dt>
          <dd>{user.id}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Update profile</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            setSaving(true);
            void updateName(newName.trim()).finally(() => {
              setSaving(false);
              setNewName("");
            });
          }}
        >
          <label htmlFor="name">Display name</label>
          <input
            id="name"
            value={newName}
            placeholder={user.name}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn" disabled={saving || !newName.trim()}>
            {saving ? "Saving…" : "Save name"}
          </button>
        </form>
      </div>

      <div className="spacer" />
      <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
        Sign out
      </button>
      <div className="foot">Installable PWA · works offline</div>
    </>
  );
}
