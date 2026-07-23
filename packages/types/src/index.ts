/**
 * @gem/types — shared domain types and zod schemas.
 *
 * This package is imported by the api, web, and mobile apps so that a single
 * source of truth defines the shape of every entity crossing the wire.
 * Full domain models (users, gems, auctions, bids, …) are added in later
 * build-order steps; step 1 establishes the package and the money primitive.
 */
export * from "./money.js";
export * from "./auth.js";
export * from "./gems.js";
export * from "./auctions.js";
