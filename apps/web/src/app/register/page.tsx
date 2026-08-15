"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GemApiError, useAuth } from "@/lib/auth";

interface Issue {
  message: string;
}

export default function RegisterPage(): React.ReactElement {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(name, email, password);
      router.push("/gems");
    } catch (err) {
      if (
        err instanceof GemApiError &&
        err.code === "INVALID_INPUT" &&
        Array.isArray(err.details)
      ) {
        setError((err.details as Issue[])[0]?.message ?? "Please check your details.");
      } else if (err instanceof GemApiError && err.code === "REGISTRATION_FAILED") {
        setError("Could not register with those details.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow" style={{ margin: "24px auto 0" }}>
      <div className="card">
        <h1>Create account</h1>
        <p className="muted">Join Gem to list and bid on gems.</p>
        <form onSubmit={(e) => void onSubmit(e)} style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="hint">
              At least 8 characters with a mix of cases, digits, or symbols.
            </div>
          </div>
          {error && (
            <div className="error" style={{ marginTop: 14 }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-block" style={{ marginTop: 18 }} disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: "0.9rem" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--brand-2)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
