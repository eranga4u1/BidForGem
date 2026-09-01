# @gem/contracts

The single source of truth for every shape that crosses the Gem API boundary —
request bodies, response envelopes, query params, entities, and realtime event
payloads. Consumed by `apps/api`, `apps/web`, and `apps/mobile`.

## What belongs here

- **Zod schemas** for wire shapes, grouped by domain (`auth`, `gems`/`media`,
  `auctions`/`bids`, `notifications`, `billing`/settings, `money`).
- **Types inferred from those schemas** via `z.infer`. Never hand-write a type
  next to a schema — infer it, so the type cannot drift from its validator.
- **Response envelopes** (`envelopes.ts`) and the per-endpoint `*ResponseSchema`
  wrappers — the client parses the _full_ wire shape, envelope included.
- **The Socket.IO event map** (`socket.ts`): event-name → payload schema/type.
  Only the type/schema map lives here; the socket client is app-specific.
- **Pure helpers** that depend on nothing but `zod`/plain JS (e.g. `money()`,
  `caratMilliFromCarat()`, `MEDIA_RULES`).

## What must NOT go here

- ❌ `@nestjs/*`, Drizzle, or any server/framework import.
- ❌ Node built-ins (`fs`, `crypto`, `path`, `buffer`, …). This package runs
  under React Native's Metro bundler, which has no Node polyfills — a single
  Node import is a build break on mobile.
- ❌ `process.env` or any environment/config reading.
- ❌ Any runtime dependency other than `zod`.

`"sideEffects": false` — keep the module graph free of side effects so bundlers
can tree-shake.

## Build

`tsc` emits ESM + `.d.ts` + declaration maps to `dist/`. No bundler, no extra
build dependency.
