/**
 * @gem/api — persistence (Drizzle) and framework-free domain logic.
 *
 * The HTTP/WebSocket (NestJS) layer is added in a later build-order step; the
 * domain modules exported here must never import framework code.
 */
export * as schema from "./db/schema.js";
export {
  createPgliteDatabase,
  createPoolDatabase,
  type Schema,
  type SqlDriver,
} from "./db/client.js";
export { runMigrations } from "./db/migrate.js";
export { seedCoreSettings, DEFAULT_POSTING_FEE } from "./db/seed.js";
export {
  placeBid,
  type PlaceBidInput,
  type PlaceBidResult,
  type PlaceBidRejection,
} from "./bidding/place-bid.js";
