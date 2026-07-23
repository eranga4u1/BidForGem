import { httpForReason } from "./error-envelope.js";

type DomainResult = { ok: true } | { ok: false; reason: string; issues?: unknown };

/**
 * Unwrap a typed domain result for a controller: return the success value, or
 * throw the mapped HttpException for the rejection reason. Keeps controllers
 * thin — no status-code logic scattered across handlers.
 */
export function unwrap<T extends DomainResult>(result: T): Extract<T, { ok: true }> {
  if (result.ok) return result as Extract<T, { ok: true }>;
  throw httpForReason(result.reason, result.issues);
}
