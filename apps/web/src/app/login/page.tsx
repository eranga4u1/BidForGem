"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GemApiError, useAuth } from "@/lib/auth";

export default function LoginPage(): React.ReactElement {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.push("/gems");
    } catch (err) {
      setError(
        err instanceof GemApiError && err.code === "INVALID_CREDENTIALS"
          ? "Incorrect email or password."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow" style={{ margin: "24px auto 0" }}>
      <div className="card">
        <h1>Sign in</h1>
        <p className="muted">Welcome back.</p>
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
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="error" style={{ marginTop: 14 }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-block" style={{ marginTop: 18 }} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: "0.9rem" }}>
          No account?{" "}
          <Link href="/register" style={{ color: "var(--brand-2)" }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
