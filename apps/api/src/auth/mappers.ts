import type { PublicUser } from "@gem/types";
import type { User } from "../db/schema.js";

/**
 * Map a raw DB user row to the public shape. This is the ONLY path from a user
 * row to an API response — it explicitly omits `passwordHash`, so a hash can
 * never leak by accidentally serializing a raw row.
 */
export function toPublicUser(row: User): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    verified: row.verified,
    createdAt: row.createdAt,
  };
}
