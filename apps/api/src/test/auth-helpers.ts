import type { AuthConfig } from "../auth/config.js";

/**
 * Test auth config: a valid 32+ char secret and intentionally CHEAP argon2
 * params so the suite hashes quickly. Production params come from env.
 */
export function makeTestAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    jwtAccessSecret: "test-secret-value-0123456789-abcdef",
    jwtIssuer: "gem-api-test",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
    argon2: { memoryCost: 8192, timeCost: 1, parallelism: 1 },
    ...overrides,
  };
}

/** A strong, policy-passing password for fixtures. */
export const VALID_PASSWORD = "Sapphire!Blue-42xz";
