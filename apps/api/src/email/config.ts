import { z } from "zod";

export interface EmailConfig {
  /** When false, the log provider is used (records intent, no network). */
  enabled: boolean;
  /** Verified sender identity for real sends. */
  from: string;
  /** Resend API key — only required (and present) when email is enabled. */
  apiKey: string | null;
  /** Base URL used to build links inside emails (e.g. password-reset). */
  appBaseUrl: string;
}

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")
  .default(false);

const emailEnvSchema = z
  .object({
    EMAIL_ENABLED: bool,
    EMAIL_FROM: z.string().min(1).default("Gem <no-reply@gem.local>"),
    EMAIL_API_KEY: z.string().min(1).optional(),
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  })
  // Fail fast: if real sending is on, the API key MUST be present. A
  // misconfigured deploy stops at boot rather than silently dropping email.
  .refine((e) => !e.EMAIL_ENABLED || (e.EMAIL_API_KEY && e.EMAIL_API_KEY.length > 0), {
    path: ["EMAIL_API_KEY"],
    message: "EMAIL_API_KEY is required when EMAIL_ENABLED is true",
  });

export function loadEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const parsed = emailEnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid email configuration: ${details}`);
  }
  const e = parsed.data;
  return {
    enabled: e.EMAIL_ENABLED,
    from: e.EMAIL_FROM,
    apiKey: e.EMAIL_API_KEY ?? null,
    appBaseUrl: e.APP_BASE_URL.replace(/\/+$/, ""),
  };
}
