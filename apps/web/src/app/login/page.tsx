"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, useAuth } from "@/lib/auth";

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
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiError && err.reason === "INVALID_CREDENTIALS"
          ? "Incorrect email or password."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="Gem" />
          <span>Gem</span>
        </div>
      </div>
      <div className="card">
        <h1>Sign in</h1>
        <p className="muted">Welcome back. Enter your details to continue.</p>
        <form onSubmit={(e) => void onSubmit(e)}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="center">
          No account?{" "}
          <Link href="/register" className="link">
            Create one
          </Link>
        </p>
      </div>
    </>
  );
}
