import { caratFromMilli, type PublicGem, type PublicMedia } from "@gem/types";
import type { Gem, Media } from "../db/schema.js";

export function toPublicMedia(row: Media): PublicMedia {
  return {
    id: row.id,
    gemId: row.gemId,
    type: row.type,
    mime: row.mime,
    size: row.size,
    status: row.status,
    url: row.url,
    createdAt: row.createdAt,
  };
}

export function toPublicGem(row: Gem, mediaRows: Media[]): PublicGem {
  return {
    id: row.id,
    sellerId: row.sellerId,
    title: row.title,
    description: row.description,
    type: row.type,
    caratMilli: row.caratMilli,
    carat: caratFromMilli(row.caratMilli),
    color: row.color,
    clarity: row.clarity,
    cut: row.cut,
    origin: row.origin,
    status: row.status,
    createdAt: row.createdAt,
    media: mediaRows.map(toPublicMedia),
  };
}
