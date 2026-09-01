/**
 * @gem/contracts — the single source of truth for every shape crossing the Gem
 * API boundary. Consumed by the api, web, and mobile apps.
 *
 * Everything here is a zod schema plus the type inferred from it (`z.infer`), so
 * a type can never drift from its runtime validator. Runtime dependency: `zod`
 * and nothing else. No Node built-ins, no `process.env`, no framework imports —
 * this package must run unchanged under React Native's Metro bundler.
 */
export * from "./envelopes.js";
export * from "./money.js";
export * from "./auth.js";
export * from "./gems.js";
export * from "./auctions.js";
export * from "./notifications.js";
export * from "./billing.js";
export * from "./socket.js";
