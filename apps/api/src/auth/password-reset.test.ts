import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { passwordResetTokens, refreshTokens, users } from "../db/schema.js";
import { makeTestAuthConfig, VALID_PASSWORD } from "../test/auth-helpers.js";
import { insertUser, makeTestDb, type AnyDb } from "../test/harness.js";
import type { RateLimiter } from "./rate-limit.js";
import { createAuthService, type AuthService, type PasswordResetMailer } from "./auth-service.js";
import { generateOpaqueToken, hashOpaqueToken } from "./tokens.js";

const NEW_PASSWORD = "Emerald!Green-99yz";
const allowAll: RateLimiter = { hit: () => true };

describe("password reset", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let auth: AuthService;
  let sent: Array<{ to: string; name: string; token: string }>;

  const config = makeTestAuthConfig();

  const makeAuth = (now?: () => Date): AuthService => {
    const mailer: PasswordResetMailer = {
      sendResetEmail: (p) => {
        sent.push(p);
        return Promise.resolve();
      },
    };
    return createAuthService({
      db,
      config,
      rateLimiter: allowAll,
      passwordResetMailer: mailer,
      ...(now ? { now } : {}),
    });
  };

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    sent = [];
    auth = makeAuth();
  });
  afterEach(async () => {
    await close();
  });

  /** Register through the service so a real (revocable) refresh token exists. */
  async function register(email: string): Promise<{ id: string; refreshToken: string }> {
    const res = await auth.register({ name: "Ada", email, password: VALID_PASSWORD });
    if (!res.ok) throw new Error("register failed");
    return { id: res.user.id, refreshToken: res.tokens.refreshToken };
  }

  async function requestReset(email: string): Promise<string | undefined> {
    await auth.forgotPassword({ email });
    return sent.at(-1)?.token;
  }

  describe("forgot-password (no enumeration)", () => {
    it("returns the identical generic response for existing and non-existing emails", async () => {
      await register("real@example.test");
      const existing = await auth.forgotPassword({ email: "real@example.test" });
      const missing = await auth.forgotPassword({ email: "nobody@example.test" });
      expect(existing).toEqual({ ok: true });
      expect(missing).toEqual({ ok: true });
      // Only the existing account produced a send.
      expect(sent.map((s) => s.to)).toEqual(["real@example.test"]);
    });

    it("stores the token HASHED (never plaintext) and emails it to the right address", async () => {
      const user = await insertUser(db, { name: "Ada", email: "ada@example.test" });
      const token = await requestReset("ada@example.test");
      expect(token).toBeTruthy();
      expect(sent.at(-1)?.to).toBe("ada@example.test");

      const [row] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));
      expect(row?.tokenHash).toBe(hashOpaqueToken(token!));
      expect(row?.tokenHash).not.toBe(token); // stored hash, not the raw token
    });
  });

  describe("reset-password", () => {
    it("with a valid token updates the hash and lets the user log in with the new password", async () => {
      await register("user@example.test");
      const token = await requestReset("user@example.test");

      const res = await auth.resetPassword({ token, password: NEW_PASSWORD });
      expect(res).toEqual({ ok: true });

      expect((await auth.login({ email: "user@example.test", password: NEW_PASSWORD })).ok).toBe(
        true,
      );
      expect((await auth.login({ email: "user@example.test", password: VALID_PASSWORD })).ok).toBe(
        false,
      );
    });

    it("rejects an unknown token", async () => {
      expect(
        await auth.resetPassword({ token: "not-a-real-token", password: NEW_PASSWORD }),
      ).toEqual({ ok: false, reason: "RESET_LINK_INVALID" });
    });

    it("rejects an expired token", async () => {
      const user = await insertUser(db, { email: "exp@example.test" });
      const { token, tokenHash } = generateOpaqueToken();
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // already expired
      });
      expect(await auth.resetPassword({ token, password: NEW_PASSWORD })).toEqual({
        ok: false,
        reason: "RESET_LINK_INVALID",
      });
    });

    it("rejects an already-used token (single-use)", async () => {
      await register("used@example.test");
      const token = await requestReset("used@example.test");
      expect((await auth.resetPassword({ token, password: NEW_PASSWORD })).ok).toBe(true);
      // Second redemption of the same token fails.
      expect(await auth.resetPassword({ token, password: "Topaz!Yellow-77ab" })).toEqual({
        ok: false,
        reason: "RESET_LINK_INVALID",
      });
    });

    it("enforces the password policy on the new password", async () => {
      await register("weak@example.test");
      const token = await requestReset("weak@example.test");
      const res = await auth.resetPassword({ token, password: "weak" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("INVALID_INPUT");
    });

    it("revokes ALL refresh tokens on success (old refresh now fails as reuse)", async () => {
      const { refreshToken } = await register("revoke@example.test");
      const token = await requestReset("revoke@example.test");
      expect((await auth.resetPassword({ token, password: NEW_PASSWORD })).ok).toBe(true);

      // The pre-reset refresh token is revoked → presenting it trips reuse detection.
      const refreshed = await auth.refresh({ refreshToken });
      expect(refreshed).toEqual({ ok: false, reason: "TOKEN_REUSE_DETECTED" });
    });

    it("invalidates other outstanding reset tokens after a successful reset", async () => {
      const user = await register("multi@example.test");
      const first = await requestReset("multi@example.test");
      const second = await requestReset("multi@example.test");
      expect(first).not.toBe(second);

      expect((await auth.resetPassword({ token: first, password: NEW_PASSWORD })).ok).toBe(true);

      // The second, still-outstanding token no longer works.
      expect(await auth.resetPassword({ token: second, password: "Topaz!Yellow-77ab" })).toEqual({
        ok: false,
        reason: "RESET_LINK_INVALID",
      });
      const rows = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));
      expect(rows.every((r) => r.usedAt !== null)).toBe(true);
    });
  });

  it("a reset does not leave any live refresh tokens for the user", async () => {
    const { id } = await register("audit@example.test");
    const token = await requestReset("audit@example.test");
    await auth.resetPassword({ token, password: NEW_PASSWORD });
    const live = (await db.select().from(refreshTokens).where(eq(refreshTokens.userId, id))).filter(
      (r) => r.revokedAt === null,
    );
    expect(live).toHaveLength(0);
    // sanity: user still exists
    expect((await db.select().from(users).where(eq(users.id, id))).length).toBe(1);
  });
});
