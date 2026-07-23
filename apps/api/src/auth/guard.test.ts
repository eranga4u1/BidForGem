import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, insertUser, type AnyDb } from "../test/harness.js";
import { makeTestAuthConfig } from "../test/auth-helpers.js";
import { authenticate, extractBearerToken } from "./guard.js";
import { signAccessToken } from "./tokens.js";

const config = makeTestAuthConfig();

describe("authenticate (access-token guard)", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  let userId: string;

  beforeEach(async () => {
    const t = await makeTestDb();
    db = t.db;
    close = t.close;
    const user = await insertUser(db, { name: "Guarded" });
    userId = user.id;
  });

  afterEach(async () => {
    await close();
  });

  it("accepts a valid access token and returns the public user", async () => {
    const token = await signAccessToken(config, { sub: userId, role: "user" });
    const res = await authenticate({ db, config }, `Bearer ${token}`);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user.id).toBe(userId);
      expect(JSON.stringify(res)).not.toMatch(/passwordHash|password_hash/i);
    }
  });

  it("rejects a missing Authorization header", async () => {
    expect(await authenticate({ db, config }, undefined)).toEqual({
      ok: false,
      reason: "MISSING_TOKEN",
    });
    expect(await authenticate({ db, config }, "")).toEqual({ ok: false, reason: "MISSING_TOKEN" });
  });

  it("rejects a malformed / invalid token", async () => {
    expect(await authenticate({ db, config }, "Bearer not.a.jwt")).toEqual({
      ok: false,
      reason: "INVALID_TOKEN",
    });
  });

  it("rejects an expired access token", async () => {
    const expired = await signAccessToken(config, { sub: userId, role: "user" }, -10);
    expect(await authenticate({ db, config }, `Bearer ${expired}`)).toEqual({
      ok: false,
      reason: "TOKEN_EXPIRED",
    });
  });

  it("rejects a token whose subject no longer exists", async () => {
    const token = await signAccessToken(config, {
      sub: "00000000-0000-0000-0000-000000000000",
      role: "user",
    });
    expect(await authenticate({ db, config }, `Bearer ${token}`)).toEqual({
      ok: false,
      reason: "USER_NOT_FOUND",
    });
  });

  it("rejects a token signed with a different secret", async () => {
    const otherConfig = makeTestAuthConfig({
      jwtAccessSecret: "a-completely-different-secret-000000",
    });
    const token = await signAccessToken(otherConfig, { sub: userId, role: "user" });
    expect(await authenticate({ db, config }, `Bearer ${token}`)).toEqual({
      ok: false,
      reason: "INVALID_TOKEN",
    });
  });
});

describe("extractBearerToken", () => {
  it("parses a bearer token case-insensitively", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(extractBearerToken("bearer abc.def")).toBe("abc.def");
  });
  it("returns null for missing or non-bearer headers", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
  });
});
