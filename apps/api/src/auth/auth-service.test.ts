import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { refreshTokens, users } from "../db/schema.js";
import { makeTestDb, type AnyDb } from "../test/harness.js";
import { makeTestAuthConfig, VALID_PASSWORD } from "../test/auth-helpers.js";
import { createInMemoryRateLimiter } from "./rate-limit.js";
import { createAuthService, type AuthService, type RegisterResult } from "./auth-service.js";

const config = makeTestAuthConfig();

describe("AuthService", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let auth: AuthService;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    auth = createAuthService({ db, config });
  });

  afterEach(async () => {
    await close();
  });

  const register = async (
    email = "buyer@example.com",
    name = "Buyer",
  ): Promise<Extract<RegisterResult, { ok: true }>> => {
    const res = await auth.register({ name, email, password: VALID_PASSWORD });
    if (!res.ok) throw new Error(`register failed: ${res.reason}`);
    return res;
  };

  describe("register", () => {
    it("creates a user and returns tokens, never exposing password_hash", async () => {
      const res = await register();
      expect(res.user.email).toBe("buyer@example.com");
      expect(res.user.role).toBe("user");
      expect(res.tokens.tokenType).toBe("Bearer");
      expect(res.tokens.accessToken).toBeTruthy();
      expect(res.tokens.refreshToken).toBeTruthy();

      // No password_hash anywhere in the response.
      expect(JSON.stringify(res)).not.toMatch(/passwordHash|password_hash/i);

      // The stored hash is a real argon2id hash, not the plaintext.
      const [row] = await db.select().from(users).where(eq(users.id, res.user.id));
      expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(row?.passwordHash).not.toContain(VALID_PASSWORD);
    });

    it("normalizes the email (trim + lowercase) before storing", async () => {
      const res = await auth.register({
        name: "Mixed",
        email: "  MiXeD@Example.COM  ",
        password: VALID_PASSWORD,
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.user.email).toBe("mixed@example.com");
    });

    it("rejects a weak password as INVALID_INPUT", async () => {
      const res = await auth.register({
        name: "Weak",
        email: "weak@example.com",
        password: "short",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("INVALID_INPUT");
    });

    it("rejects a duplicate email generically, without leaking existence", async () => {
      await register("dupe@example.com");
      const again = await auth.register({
        name: "Other",
        email: "dupe@example.com",
        password: VALID_PASSWORD,
      });
      expect(again).toEqual({ ok: false, reason: "REGISTRATION_FAILED" });
    });
  });

  describe("login", () => {
    it("succeeds with correct credentials", async () => {
      await register("login@example.com");
      const res = await auth.login({ email: "login@example.com", password: VALID_PASSWORD });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.user.email).toBe("login@example.com");
        expect(JSON.stringify(res)).not.toMatch(/passwordHash|password_hash/i);
      }
    });

    it("fails with a wrong password", async () => {
      await register("login2@example.com");
      const res = await auth.login({ email: "login2@example.com", password: "Wrong!Password-99" });
      expect(res).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    });

    it("returns the SAME error shape for a non-existent email as for a wrong password", async () => {
      const missing = await auth.login({ email: "nobody@example.com", password: VALID_PASSWORD });
      await register("real@example.com");
      const wrong = await auth.login({ email: "real@example.com", password: "Wrong!Password-99" });
      expect(missing).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
      expect(wrong).toEqual(missing);
    });
  });

  describe("refresh & rotation", () => {
    it("issues a new pair and rotates the refresh token", async () => {
      const s0 = await register("rot@example.com");
      const r1 = await auth.refresh({ refreshToken: s0.tokens.refreshToken });
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      expect(r1.tokens.refreshToken).not.toBe(s0.tokens.refreshToken);

      // The newly issued token continues the chain.
      const r2 = await auth.refresh({ refreshToken: r1.tokens.refreshToken });
      expect(r2.ok).toBe(true);
    });

    it("revokes the old refresh token when a new one is issued", async () => {
      const s0 = await register("rev@example.com");
      const r1 = await auth.refresh({ refreshToken: s0.tokens.refreshToken });
      expect(r1.ok).toBe(true);

      // Presenting the now-rotated original token is treated as reuse.
      const replay = await auth.refresh({ refreshToken: s0.tokens.refreshToken });
      expect(replay).toEqual({ ok: false, reason: "TOKEN_REUSE_DETECTED" });
    });

    it("reuse detection revokes the entire token family", async () => {
      const s0 = await register("reuse@example.com");
      const r1 = await auth.refresh({ refreshToken: s0.tokens.refreshToken });
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;

      // Replay the revoked original -> reuse detected, family nuked.
      const replay = await auth.refresh({ refreshToken: s0.tokens.refreshToken });
      expect(replay).toEqual({ ok: false, reason: "TOKEN_REUSE_DETECTED" });

      // The good rotated token (r1) is now revoked too.
      const afterFamilyRevoke = await auth.refresh({ refreshToken: r1.tokens.refreshToken });
      expect(afterFamilyRevoke.ok).toBe(false);

      // Every refresh token for the user is revoked.
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, s0.user.id));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it("rejects an unknown refresh token", async () => {
      const res = await auth.refresh({ refreshToken: "not-a-real-token" });
      expect(res).toEqual({ ok: false, reason: "INVALID_TOKEN" });
    });

    it("rejects an expired refresh token", async () => {
      const s0 = await register("exp@example.com");
      // A service whose clock is 40 days ahead sees the 30-day token as expired.
      const future = createAuthService({
        db,
        config,
        now: () => new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
      });
      const res = await future.refresh({ refreshToken: s0.tokens.refreshToken });
      expect(res).toEqual({ ok: false, reason: "TOKEN_EXPIRED" });
    });
  });

  describe("logout", () => {
    it("revokes the token so a later refresh fails", async () => {
      const s0 = await register("out@example.com");
      const out = await auth.logout({ refreshToken: s0.tokens.refreshToken });
      expect(out).toEqual({ ok: true });

      const after = await auth.refresh({ refreshToken: s0.tokens.refreshToken });
      expect(after.ok).toBe(false);
    });
  });

  describe("updateProfile", () => {
    it("updates only the caller's own record", async () => {
      const a = await register("a@example.com", "Alice");
      const b = await register("b@example.com", "Bob");

      const res = await auth.updateProfile(a.user.id, { name: "Alice Renamed" });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.user.name).toBe("Alice Renamed");

      const [bRow] = await db.select().from(users).where(eq(users.id, b.user.id));
      expect(bRow?.name).toBe("Bob"); // untouched
    });

    it("rejects a blank name as INVALID_INPUT", async () => {
      const a = await register("c@example.com");
      const res = await auth.updateProfile(a.user.id, { name: "   " });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("INVALID_INPUT");
    });
  });

  describe("rate limiting", () => {
    it("returns RATE_LIMITED once the per-email login budget is exceeded", async () => {
      const limiter = createInMemoryRateLimiter();
      const limited = createAuthService({ db, config, rateLimiter: limiter });
      await limited.register({ name: "RL", email: "rl@example.com", password: VALID_PASSWORD });

      // Per-email budget is 5 per window; the 6th attempt is limited.
      const attempts = [];
      for (let i = 0; i < 6; i++) {
        attempts.push(
          await limited.login(
            { email: "rl@example.com", password: "Wrong!Password-99" },
            { ip: "1.2.3.4" },
          ),
        );
      }
      expect(attempts.slice(0, 5).every((r) => !r.ok && r.reason === "INVALID_CREDENTIALS")).toBe(
        true,
      );
      expect(attempts[5]).toEqual({ ok: false, reason: "RATE_LIMITED" });
    });
  });
});
