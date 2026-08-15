"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/api";
import { GemApiError } from "@/lib/auth";

function ResetPasswordForm(): React.ReactElement {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof GemApiError && err.code === "RESET_LINK_INVALID") {
        setError("This reset link is invalid or has expired. Request a new one.");
      } else if (err instanceof GemApiError && err.code === "INVALID_INPUT") {
        const detail = Array.isArray(err.details)
          ? (err.details[0] as { message?: string } | undefined)?.message
          : undefined;
        setError(detail ?? "Please choose a stronger password (at least 12 characters).");
      } else {
        setError("Couldn’t reset your password. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card">
        <h1>Password updated</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Your password has been reset. You can now sign in with your new password.
        </p>
        <Link href="/login" className="btn btn-block" style={{ marginTop: 18 }}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Choose a new password</h1>
      {!token ? (
        <>
          <p className="muted" style={{ marginTop: 8 }}>
            This reset link is missing its token. Request a new link.
          </p>
          <Link href="/forgot-password" className="btn btn-block" style={{ marginTop: 18 }}>
            Request a new link
          </Link>
        </>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="error" style={{ marginTop: 14 }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-block" style={{ marginTop: 18 }} disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <div className="narrow" style={{ margin: "24px auto 0" }}>
      <Suspense fallback={<div className="card">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
