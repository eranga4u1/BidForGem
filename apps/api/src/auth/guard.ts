import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PublicUser } from "@gem/types";
import type { Schema } from "../db/client.js";
import { users } from "../db/schema.js";
import type { AuthConfig } from "./config.js";
import { toPublicUser } from "./mappers.js";
import { verifyAccessToken, type AccessTokenClaims } from "./tokens.js";

export type AuthenticateResult =
  | { ok: true; user: PublicUser; claims: AccessTokenClaims }
  | { ok: false; reason: "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_EXPIRED" | "USER_NOT_FOUND" };

/** Extract a bearer token from an Authorization header value. */
export function extractBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

export interface GuardDeps<T extends PgQueryResultHKT> {
  db: PgDatabase<T, Schema>;
  config: AuthConfig;
}

/**
 * Framework-thin authentication guard: validate the access token from an
 * Authorization header and load the current user. HTTP/WS layers call this and
 * map the typed result to a status code / attach `user` to the request.
 */
export async function authenticate<T extends PgQueryResultHKT>(
  deps: GuardDeps<T>,
  authorizationHeader: string | null | undefined,
): Promise<AuthenticateResult> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) return { ok: false, reason: "MISSING_TOKEN" };

  const verified = await verifyAccessToken(deps.config, token);
  if (!verified.ok) return { ok: false, reason: verified.reason };

  const [user] = await deps.db
    .select()
    .from(users)
    .where(eq(users.id, verified.claims.sub))
    .limit(1);
  if (!user) return { ok: false, reason: "USER_NOT_FOUND" };

  return { ok: true, user: toPublicUser(user), claims: verified.claims };
}
