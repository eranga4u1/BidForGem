/** Minimal structural view of a zod issue (avoids depending on zod's internal type names). */
export interface SchemaIssue {
  path: PropertyKey[];
  message: string;
}

/**
 * Error carrying the API's typed error envelope (HTTP status + code + parsed
 * body). Thrown for any non-2xx response.
 */
export class GemApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    /** The raw parsed response body, whatever shape it had. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "GemApiError";
  }
}

/**
 * Raised when the session cannot be authenticated: no refresh token, or a
 * refresh attempt was rejected. Surfaced exactly once — storage is cleared and
 * callers should route the user to sign-in. Never retried in a loop.
 */
export class UnauthenticatedError extends Error {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * Raised when a 2xx response body does not match its contracts schema — the
 * guard against a silent request/response envelope drift between API and app.
 * The message names the endpoint and the first failing field.
 */
export class SchemaMismatchError extends Error {
  constructor(
    /** e.g. "POST /auth/login" */
    readonly endpoint: string,
    readonly issues: SchemaIssue[],
    /** The body that failed validation, for debugging. */
    readonly received: unknown,
  ) {
    const first = issues[0];
    const where = first ? first.path.map(String).join(".") || "(root)" : "(unknown)";
    const why = first ? first.message : "unknown validation error";
    super(`Response from ${endpoint} did not match the expected schema at "${where}": ${why}`);
    this.name = "SchemaMismatchError";
  }
}
