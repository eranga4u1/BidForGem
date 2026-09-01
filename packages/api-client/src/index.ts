/**
 * @gem/api-client — the typed fetch layer shared by the Gem web and mobile apps.
 *
 * Platform-neutral: it uses only the global `fetch` and runs unchanged in Node,
 * the browser, and Hermes. The base URL and a {@link TokenStorage} adapter are
 * injected at construction; the package reads no environment and touches no
 * platform storage itself.
 *
 * The client holds the access token in memory, persists only the refresh token
 * (via the injected storage), performs single-flight refresh on 401, and parses
 * every response through its `@gem/contracts` schema — so an API/app envelope
 * drift surfaces as a descriptive {@link SchemaMismatchError} rather than a
 * silent bug.
 */
export { createGemApiClient } from "./gem-client.js";
export type {
  GemApiClient,
  GemApiClientOptions,
  RequestOptions,
  AuthSession,
} from "./gem-client.js";
export { GemApiError, UnauthenticatedError, SchemaMismatchError } from "./errors.js";
export type { SchemaIssue } from "./errors.js";
export { createMemoryTokenStorage } from "./token-storage.js";
export type { TokenStorage } from "./token-storage.js";
