import type { EmailConfig } from "./config.js";
import { createLogEmailProvider } from "./log-provider.js";
import type { EmailProvider } from "./provider.js";
import { createResendEmailProvider } from "./resend-provider.js";

export type { EmailProvider, SentEmail } from "./provider.js";
export type { EmailConfig } from "./config.js";
export { loadEmailConfig } from "./config.js";
export { createLogEmailProvider, type LogEmailProvider } from "./log-provider.js";
export { createResendEmailProvider } from "./resend-provider.js";
export type { RenderedEmail } from "../mail/templates/index.js";

/** Pick the provider from config: real Resend when enabled, else the log fake. */
export function createEmailProvider(config: EmailConfig): EmailProvider {
  if (config.enabled && config.apiKey) {
    return createResendEmailProvider({ apiKey: config.apiKey, from: config.from });
  }
  return createLogEmailProvider();
}
