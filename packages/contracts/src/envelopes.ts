import { z } from "zod";

/**
 * Shared response envelopes. Every successful API response is wrapped in an
 * object with `ok: true`; errors use the {@link errorEnvelopeSchema} shape.
 * Keeping these here (not in the client) makes the envelope part of the single
 * source of truth, so the client parses the FULL wire shape — envelope included
 * — through a contracts schema.
 */

/** Bare success envelope for endpoints that return no payload. */
export const okResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponseSchema>;

/** The consistent error body returned by the API on a non-2xx response. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Wrap an item schema in the standard paginated-list envelope. */
export function listResponseSchema<T extends z.ZodTypeAny>(
  item: T,
): z.ZodObject<{
  ok: z.ZodLiteral<true>;
  items: z.ZodArray<T>;
  limit: z.ZodNumber;
  offset: z.ZodNumber;
}> {
  return z.object({
    ok: z.literal(true),
    items: z.array(item),
    limit: z.number().int(),
    offset: z.number().int(),
  });
}
