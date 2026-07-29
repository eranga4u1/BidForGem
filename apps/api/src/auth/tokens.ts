import { createHash, randomBytes } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";
import type { UserRole } from "@gem/types";
import type { AuthConfig } from "./config.js";

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}

function signingKey(config: AuthConfig): Uint8Array {
  return new TextEncoder().encode(config.jwtAccessSecret);
}

/**
 * Sign a short-lived stateless access token. `ttlSecondsOverride` exists for
 * tests (e.g. to mint an already-expired token); production uses the config TTL.
 */
export async function signAccessToken(
  config: AuthConfig,
  input: { sub: string; role: UserRole },
  ttlSecondsOverride?: number,
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttl = ttlSecondsOverride ?? config.accessTokenTtlSeconds;
  return new SignJWT({ role: input.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.sub)
    .setIssuedAt(nowSeconds)
    .setIssuer(config.jwtIssuer)
    .setExpirationTime(nowSeconds + ttl)
    .sign(signingKey(config));
}

export type VerifyAccessTokenResult =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; reason: "TOKEN_EXPIRED" | "INVALID_TOKEN" };

export async function verifyAccessToken(
  config: AuthConfig,
  token: string,
): Promise<VerifyAccessTokenResult> {
  try {
    const { payload } = await jwtVerify(token, signingKey(config), {
      issuer: config.jwtIssuer,
      algorithms: ["HS256"],
    });
    const role = payload.role;
    if (
      typeof payload.sub !== "string" ||
      (role !== "user" && role !== "admin") ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return { ok: false, reason: "INVALID_TOKEN" };
    }
    return { ok: true, claims: { sub: payload.sub, role, iat: payload.iat, exp: payload.exp } };
  } catch (err) {
    if (err instanceof errors.JWTExpired) return { ok: false, reason: "TOKEN_EXPIRED" };
    return { ok: false, reason: "INVALID_TOKEN" };
  }
}

/** Create a high-entropy opaque token and its SHA-256 storage hash. */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashOpaqueToken(token) };
}

/** Create a new opaque refresh token and its storage hash. */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  return generateOpaqueToken();
}

/** Hash an opaque token for storage/lookup (fast; the token is high-entropy). */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Back-compat alias — refresh tokens hash the same way as any opaque token. */
export const hashRefreshToken = hashOpaqueToken;
