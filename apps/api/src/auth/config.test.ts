import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "./config.js";

describe("loadAuthConfig", () => {
  it("fails fast when the signing secret is missing", () => {
    expect(() => loadAuthConfig({})).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("fails fast when the signing secret is too short", () => {
    expect(() => loadAuthConfig({ JWT_ACCESS_SECRET: "too-short" })).toThrow(/at least 32/);
  });

  it("returns a validated config with sensible defaults", () => {
    const config = loadAuthConfig({ JWT_ACCESS_SECRET: "x".repeat(32) });
    expect(config.jwtIssuer).toBe("gem-api");
    expect(config.accessTokenTtlSeconds).toBe(15 * 60);
    expect(config.refreshTokenTtlSeconds).toBe(30 * 24 * 60 * 60);
    expect(config.argon2).toEqual({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
  });

  it("reads overrides from the environment", () => {
    const config = loadAuthConfig({
      JWT_ACCESS_SECRET: "x".repeat(40),
      JWT_ISSUER: "custom",
      ACCESS_TOKEN_TTL_SECONDS: "300",
    });
    expect(config.jwtIssuer).toBe("custom");
    expect(config.accessTokenTtlSeconds).toBe(300);
  });
});
