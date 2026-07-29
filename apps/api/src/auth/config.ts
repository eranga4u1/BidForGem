import { z } from "zod";

export interface Argon2Params {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export interface AuthConfig {
  /** HMAC signing key for access tokens. Must be provided by the environment. */
  jwtAccessSecret: string;
  jwtIssuer: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  /** Lifetime of an emailed password-reset token (short-lived, single-use). */
  passwordResetTtlSeconds: number;
  argon2: Argon2Params;
}

const DAY = 60 * 60 * 24;

/**
 * Environment schema for auth. The signing secret is REQUIRED with a real
 * minimum length — there is no silent fallback default, so a misconfigured
 * deployment fails fast at boot rather than signing tokens with a guessable key.
 */
const authEnvSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_ISSUER: z.string().min(1).default("gem-api"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * DAY),
  PASSWORD_RESET_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),
});

/**
 * Load and validate auth configuration from the environment. Throws (fail-fast)
 * if required secrets are missing or invalid — never returns a weakened config.
 */
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const parsed = authEnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid auth configuration: ${details}`);
  }
  const e = parsed.data;
  return {
    jwtAccessSecret: e.JWT_ACCESS_SECRET,
    jwtIssuer: e.JWT_ISSUER,
    accessTokenTtlSeconds: e.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: e.REFRESH_TOKEN_TTL_SECONDS,
    passwordResetTtlSeconds: e.PASSWORD_RESET_TTL_SECONDS,
    argon2: {
      memoryCost: e.ARGON2_MEMORY_COST,
      timeCost: e.ARGON2_TIME_COST,
      parallelism: e.ARGON2_PARALLELISM,
    },
  };
}
