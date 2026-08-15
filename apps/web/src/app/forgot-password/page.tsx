"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

export default function ForgotPasswordPage(): React.ReactElement {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.auth.forgotPassword(email);
      // Non-enumerating: we always show the same confirmation.
      setSent(true);
    } catch {
      setError("Couldn’t send the reset link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow" style={{ margin: "24px auto 0" }}>
      <div className="card">
        <h1>Reset your password</h1>
        {sent ? (
          <>
            <p className="muted" style={{ marginTop: 8 }}>
              If an account exists for <strong>{email}</strong>, we’ve sent a link to reset your
              password. Check your inbox (and spam).
            </p>
            <Link href="/login" className="btn btn-block" style={{ marginTop: 18 }}>
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="muted">Enter your email and we’ll send you a reset link.</p>
            <form onSubmit={(e) => void onSubmit(e)} style={{ marginTop: 18 }}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="error" style={{ marginTop: 14 }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                className="btn btn-block"
                style={{ marginTop: 18 }}
                disabled={busy}
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
            <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: "0.9rem" }}>
              <Link href="/login" style={{ color: "var(--brand-2)" }}>
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
