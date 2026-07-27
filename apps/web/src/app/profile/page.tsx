"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export default function ProfilePage(): React.ReactElement {
  const { user, status, updateName, logout } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

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
    </div>
  );
}
