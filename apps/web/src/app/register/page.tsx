"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, useAuth } from "@/lib/auth";

interface ZodIssue {
  message: string;
  path: (string | number)[];
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
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError && err.reason === "INVALID_INPUT" && Array.isArray(err.issues)) {
        const first = (err.issues as ZodIssue[])[0];
        setError(first?.message ?? "Please check your details.");
      } else if (err instanceof ApiError && err.reason === "REGISTRATION_FAILED") {
        setError("Could not register with those details.");
      } else {
        setError("Something went wrong. Please try again.");
      }
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
        <h1>Create account</h1>
        <p className="muted">Join Gem to list and bid on gems.</p>
        <form onSubmit={(e) => void onSubmit(e)}>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="muted" style={{ marginTop: 8 }}>
            At least 12 characters, with a mix of upper/lowercase, digits, or symbols.
          </p>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="center">
          Already have an account?{" "}
          <Link href="/login" className="link">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
