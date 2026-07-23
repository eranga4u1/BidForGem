import { z } from "zod";

/** Gem lifecycle status (mirrors the DB enum). */
export const gemStatusSchema = z.enum(["draft", "active", "sold", "closed"]);
export type GemStatus = z.infer<typeof gemStatusSchema>;

export const mediaTypeSchema = z.enum(["photo", "video", "certificate"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const mediaStatusSchema = z.enum(["pending", "ready"]);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

// --- carat scaling: carats are accepted as decimals at the edge and stored as
// integer milli-carats (carats x 1000). Convert ONCE, here at the boundary.
export function caratMilliFromCarat(carat: number): number {
  return Math.round(carat * 1000);
}
export function caratFromMilli(caratMilli: number): number {
  return caratMilli / 1000;
}

/** Per-gem media count limits by type. */
export const MEDIA_LIMITS = { photo: 12, video: 3, certificate: 5 } as const;

const MB = 1024 * 1024;

/** Allowed MIME types and max sizes per media type. Enforced before issuing a URL. */
export const MEDIA_RULES: Record<MediaType, { mimes: readonly string[]; maxBytes: number }> = {
  photo: { mimes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10 * MB },
  video: { mimes: ["video/mp4", "video/quicktime"], maxBytes: 200 * MB },
  certificate: {
    mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxBytes: 20 * MB,
  },
};

const optionalText = (max: number): z.ZodOptional<z.ZodString> =>
  z.string().trim().max(max).optional();

export const createGemInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalText(5000),
  type: z.string().trim().min(1, "Type is required").max(80),
  /** Decimal carats (e.g. 2.5). Converted to integer carat_milli at the boundary. */
  carat: z.number().positive().max(100_000),
  color: optionalText(80),
  clarity: optionalText(80),
  cut: optionalText(80),
  origin: optionalText(120),
});
export type CreateGemInput = z.infer<typeof createGemInputSchema>;

export const updateGemInputSchema = createGemInputSchema.partial();
export type UpdateGemInput = z.infer<typeof updateGemInputSchema>;

export const gemFilterSchema = z.object({
  type: z.string().trim().optional(),
  color: z.string().trim().optional(),
  clarity: z.string().trim().optional(),
  cut: z.string().trim().optional(),
  origin: z.string().trim().optional(),
  caratMin: z.coerce.number().nonnegative().optional(),
  caratMax: z.coerce.number().positive().optional(),
  status: gemStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type GemFilter = z.infer<typeof gemFilterSchema>;
export type GemFilterInput = z.input<typeof gemFilterSchema>;

export const requestUploadInputSchema = z.object({
  type: mediaTypeSchema,
  mime: z.string().trim().min(1),
  sizeBytes: z.coerce.number().int().positive(),
  /** Advisory only — NEVER used to build the storage key. */
  filename: z.string().trim().max(255).optional(),
});
export type RequestUploadInput = z.infer<typeof requestUploadInputSchema>;

export const publicMediaSchema = z.object({
  id: z.uuid(),
  gemId: z.uuid(),
  type: mediaTypeSchema,
  mime: z.string(),
  size: z.number().int(),
  status: mediaStatusSchema,
  /** Public CDN URL for photos/videos; null for certificates (signed URL only). */
  url: z.string().nullable(),
  createdAt: z.date(),
});
export type PublicMedia = z.infer<typeof publicMediaSchema>;

export const publicGemSchema = z.object({
  id: z.uuid(),
  sellerId: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  caratMilli: z.number().int(),
  carat: z.number(),
  color: z.string().nullable(),
  clarity: z.string().nullable(),
  cut: z.string().nullable(),
  origin: z.string().nullable(),
  status: gemStatusSchema,
  createdAt: z.date(),
  media: z.array(publicMediaSchema),
});
export type PublicGem = z.infer<typeof publicGemSchema>;

/** Response when an upload URL is issued. */
export interface UploadTicket {
  mediaId: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}
