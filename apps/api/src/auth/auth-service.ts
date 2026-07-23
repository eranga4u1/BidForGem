import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  loginInputSchema,
  refreshInputSchema,
  registerInputSchema,
  updateProfileInputSchema,
  type AuthTokens,
  type PublicUser,
  type UserRole,
} from "@gem/types";
import type { ZodError } from "zod";
import type { Schema } from "../db/client.js";
import { refreshTokens, users } from "../db/schema.js";
import type { AuthConfig } from "./config.js";
import { getDummyHash, hashPassword, verifyPassword } from "./password.js";
import type { RateLimiter } from "./rate-limit.js";
import { toPublicUser } from "./mappers.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "./tokens.js";

/** Per-request metadata used for rate-limit keys and refresh-token auditing. */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

type ValidationIssues = ZodError["issues"];

export type RegisterResult =
  | { ok: true; user: PublicUser; tokens: AuthTokens }
  | { ok: false; reason: "INVALID_INPUT"; issues: ValidationIssues }
  | { ok: false; reason: "RATE_LIMITED" | "REGISTRATION_FAILED" };

export type LoginResult =
  | { ok: true; user: PublicUser; tokens: AuthTokens }
  | { ok: false; reason: "INVALID_INPUT"; issues: ValidationIssues }
  | { ok: false; reason: "RATE_LIMITED" | "INVALID_CREDENTIALS" };

export type RefreshResult =
  | { ok: true; user: PublicUser; tokens: AuthTokens }
  | { ok: false; reason: "INVALID_INPUT"; issues: ValidationIssues }
  | {
      ok: false;
      reason: "RATE_LIMITED" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "TOKEN_REUSE_DETECTED";
    };

export type UpdateProfileResult =
  | { ok: true; user: PublicUser }
  | { ok: false; reason: "INVALID_INPUT"; issues: ValidationIssues }
  | { ok: false; reason: "USER_NOT_FOUND" };

// Rate-limit budgets (requests per window). Deliberately conservative.
const LIMITS = {
  registerPerIp: { limit: 10, windowMs: 60 * 60 * 1000 },
  loginPerIp: { limit: 20, windowMs: 15 * 60 * 1000 },
  loginPerEmail: { limit: 5, windowMs: 15 * 60 * 1000 },
  refreshPerIp: { limit: 60, windowMs: 15 * 60 * 1000 },
} as const;

export interface AuthServiceDeps<T extends PgQueryResultHKT> {
  db: PgDatabase<T, Schema>;
  config: AuthConfig;
  rateLimiter?: RateLimiter;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

export interface AuthService {
  register(input: unknown, ctx?: RequestContext): Promise<RegisterResult>;
  login(input: unknown, ctx?: RequestContext): Promise<LoginResult>;
  refresh(input: unknown, ctx?: RequestContext): Promise<RefreshResult>;
  logout(input: unknown): Promise<{ ok: true }>;
  updateProfile(userId: string, input: unknown): Promise<UpdateProfileResult>;
}

export function createAuthService<T extends PgQueryResultHKT>(
  deps: AuthServiceDeps<T>,
): AuthService {
  const { db, config, rateLimiter } = deps;
  const now = deps.now ?? (() => new Date());

  function allowed(key: string, budget: { limit: number; windowMs: number }): boolean {
    if (!rateLimiter) return true;
    return rateLimiter.hit(key, budget.limit, budget.windowMs);
  }

  /** Mint an access + refresh pair and persist the (hashed) refresh token. */
  async function issueTokens(
    exec: PgDatabase<T, Schema>,
    userId: string,
    role: UserRole,
    ctx: RequestContext,
  ): Promise<AuthTokens> {
    const accessToken = await signAccessToken(config, { sub: userId, role });
    const { token, tokenHash } = generateRefreshToken();
    const expiresAt = new Date(now().getTime() + config.refreshTokenTtlSeconds * 1000);
    await exec.insert(refreshTokens).values({
      userId,
      tokenHash,
      expiresAt,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    });
    return {
      accessToken,
      refreshToken: token,
      tokenType: "Bearer",
      expiresIn: config.accessTokenTtlSeconds,
    };
  }

  return {
    async register(rawInput, ctx = {}) {
      const parsed = registerInputSchema.safeParse(rawInput);
      if (!parsed.success)
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      const { name, email, password } = parsed.data;

      if (!allowed(`register:ip:${ctx.ip ?? "unknown"}`, LIMITS.registerPerIp)) {
        return { ok: false, reason: "RATE_LIMITED" };
      }

      // Always hash before touching the DB so timing/behaviour is uniform
      // regardless of whether the email already exists.
      const passwordHash = await hashPassword(config.argon2, password);

      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx.insert(users).values({ name, email, passwordHash }).returning();
          if (!row) throw new Error("User insert returned no row");
          const tokens = await issueTokens(tx, row.id, row.role, ctx);
          return { ok: true, user: toPublicUser(row), tokens };
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Generic failure — do not reveal that the email is already registered.
          return { ok: false, reason: "REGISTRATION_FAILED" };
        }
        throw err;
      }
    },

    async login(rawInput, ctx = {}) {
      const parsed = loginInputSchema.safeParse(rawInput);
      if (!parsed.success)
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };
      const { email, password } = parsed.data;

      if (
        !allowed(`login:ip:${ctx.ip ?? "unknown"}`, LIMITS.loginPerIp) ||
        !allowed(`login:email:${email}`, LIMITS.loginPerEmail)
      ) {
        return { ok: false, reason: "RATE_LIMITED" };
      }

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      if (!user) {
        // Equalize timing with the found path — verify against a dummy hash.
        await verifyPassword(await getDummyHash(config.argon2), password);
        return { ok: false, reason: "INVALID_CREDENTIALS" };
      }

      const valid = await verifyPassword(user.passwordHash, password);
      if (!valid) return { ok: false, reason: "INVALID_CREDENTIALS" };

      const tokens = await db.transaction((tx) => issueTokens(tx, user.id, user.role, ctx));
      return { ok: true, user: toPublicUser(user), tokens };
    },

    async refresh(rawInput, ctx = {}) {
      const parsed = refreshInputSchema.safeParse(rawInput);
      if (!parsed.success)
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };

      if (!allowed(`refresh:ip:${ctx.ip ?? "unknown"}`, LIMITS.refreshPerIp)) {
        return { ok: false, reason: "RATE_LIMITED" };
      }

      const tokenHash = hashRefreshToken(parsed.data.refreshToken);

      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, tokenHash))
          .limit(1);

        if (!existing) return { ok: false, reason: "INVALID_TOKEN" };

        // Reuse detection: a revoked token being presented means it was either
        // already rotated or stolen. Revoke the user's ENTIRE token family.
        if (existing.revokedAt !== null) {
          await tx
            .update(refreshTokens)
            .set({ revokedAt: now() })
            .where(and(eq(refreshTokens.userId, existing.userId), isNull(refreshTokens.revokedAt)));
          return { ok: false, reason: "TOKEN_REUSE_DETECTED" };
        }

        if (existing.expiresAt.getTime() <= now().getTime()) {
          await tx
            .update(refreshTokens)
            .set({ revokedAt: now() })
            .where(eq(refreshTokens.id, existing.id));
          return { ok: false, reason: "TOKEN_EXPIRED" };
        }

        // Rotate: revoke the presented token, then issue a fresh pair.
        await tx
          .update(refreshTokens)
          .set({ revokedAt: now() })
          .where(eq(refreshTokens.id, existing.id));

        const [user] = await tx.select().from(users).where(eq(users.id, existing.userId)).limit(1);
        if (!user) return { ok: false, reason: "INVALID_TOKEN" };

        const tokens = await issueTokens(tx, user.id, user.role, ctx);
        return { ok: true, user: toPublicUser(user), tokens };
      });
    },

    async logout(rawInput) {
      const parsed = refreshInputSchema.safeParse(rawInput);
      // Logout is best-effort and must not leak whether the token existed.
      if (!parsed.success) return { ok: true };
      const tokenHash = hashRefreshToken(parsed.data.refreshToken);
      await db
        .update(refreshTokens)
        .set({ revokedAt: now() })
        .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
      return { ok: true };
    },

    async updateProfile(userId, rawInput) {
      const parsed = updateProfileInputSchema.safeParse(rawInput);
      if (!parsed.success)
        return { ok: false, reason: "INVALID_INPUT", issues: parsed.error.issues };

      const [updated] = await db
        .update(users)
        .set({ name: parsed.data.name })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) return { ok: false, reason: "USER_NOT_FOUND" };
      return { ok: true, user: toPublicUser(updated) };
    },
  };
}

/**
 * Detect a Postgres unique-violation (SQLSTATE 23505). Drizzle wraps the driver
 * error in a DrizzleQueryError, so the pg error (with `.code`) may be nested on
 * `.cause` — walk the chain.
 */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === "23505"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
