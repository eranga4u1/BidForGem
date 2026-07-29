import { z } from "zod";

/**
 * Shared auth contracts. These schemas are the single source of truth for the
 * shapes crossing the API boundary (imported by web, mobile, and the api).
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

/** A small blocklist of trivially weak passwords / substrings. */
const TRIVIAL_PASSWORD_PATTERNS = [
  "password",
  "passw0rd",
  "qwerty",
  "letmein",
  "admin",
  "welcome",
  "iloveyou",
  "123456",
  "12345678",
  "0000000",
];

function characterClassCount(pw: string): number {
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  return classes;
}

function isTrivialPassword(pw: string): boolean {
  const lower = pw.toLowerCase();
  if (TRIVIAL_PASSWORD_PATTERNS.some((p) => lower.includes(p))) return true;
  // A single repeated character (e.g. "aaaaaaaaaaaa").
  if (new Set(pw).size <= 2) return true;
  return false;
}

/** Password policy: length + complexity + not-trivial. Not stored anywhere. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH)
  .refine(
    (pw) => characterClassCount(pw) >= 3,
    "Password must include at least 3 of: lowercase, uppercase, digit, symbol",
  )
  .refine((pw) => !isTrivialPassword(pw), "Password is too common or trivial");

/** Email normalized to a canonical form (trimmed + lowercased) before validation. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const nameSchema = z.string().trim().min(1, "Name is required").max(200);

export const registerInputSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  // Login only checks presence; the policy is enforced at registration.
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const refreshInputSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});
export type RefreshInput = z.infer<typeof refreshInputSchema>;

export const updateProfileInputSchema = z.object({
  name: nameSchema,
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export const forgotPasswordInputSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

/** Reset consumes an opaque token and sets a new password (same policy as register). */
export const resetPasswordInputSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

/** Roles a user can hold. Mirrors the DB enum. */
export const userRoleSchema = z.enum(["user", "admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * The ONLY user shape that may cross the API boundary. Note the deliberate
 * absence of `password_hash` — endpoints map DB rows to this explicitly.
 */
export const publicUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: userRoleSchema,
  verified: z.boolean(),
  createdAt: z.coerce.date(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal("Bearer"),
  /** Access-token lifetime in seconds. */
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

/** Standard successful auth response (register / login / refresh). */
export const authSessionSchema = z.object({
  user: publicUserSchema,
  tokens: authTokensSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;
