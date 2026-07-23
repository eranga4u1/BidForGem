# Gem — Bidding Platform Monorepo

A gem auction platform: users create profiles, post gem listings with media, and
bid on gems in live, server-timed auctions. Web, mobile, and API share a single
set of domain types and a typed API client.

## Workspace layout

```
apps/
  api      NestJS + TypeScript      (build-order step 3+)
  web      Next.js (App Router)     (build-order step 4+)
  mobile   Expo / React Native      (build-order step 4+)
packages/
  types        Shared domain types + zod schemas (@gem/types)
  api-client   Typed fetch layer for web + mobile (@gem/api-client)
  config       Shared ESLint / Prettier / tsconfig (@gem/config)
```

The `apps/*` packages are scaffolded in their own build-order steps; step 1
establishes the monorepo, tooling, shared config, and the shared packages.

## Toolchain

| Concern       | Choice                                             |
| ------------- | -------------------------------------------------- |
| Package mgr   | pnpm (workspaces) via Corepack                     |
| Task runner   | Turborepo                                          |
| Language      | TypeScript 6 (strict), ESM                         |
| Database      | PostgreSQL 17 + Drizzle ORM                        |
| Lint / format | ESLint 10 (flat) + Prettier                        |
| Tests         | Vitest (+ PGlite in-process Postgres for DB tests) |
| Commits       | Conventional Commits (commitlint + husky)          |

> **DB / ORM (decided):** Drizzle ORM over PostgreSQL 17, chosen for explicit
> control over `SELECT ... FOR UPDATE` row locking in the bidding path. DB tests
> run against `@electric-sql/pglite` — a real Postgres compiled to WASM, in
> process, no external database. Introduced with the schema in step 2.

> **TypeScript version note:** we pin TypeScript `^6.0.3` (the last stable
> classic compiler) rather than the newer `7.x` native compiler. As of this
> writing `typescript-eslint@8` declares a `typescript <6.1.0` peer range, so
> the lint/typecheck toolchain does not yet support TS 7. Revisit once
> `typescript-eslint` ships TS 7 support.

## Getting started

```bash
corepack enable            # activate the pinned pnpm
pnpm install
pnpm typecheck             # tsc --noEmit across the graph
pnpm lint                  # eslint (flat config)
pnpm format:check          # prettier --check
pnpm test                  # vitest
pnpm build                 # turbo build
```

## Engineering standards

- TypeScript everywhere, `strict` on. No `any` without a justifying comment.
- Clean architecture: domain logic separated from framework/transport code.
- **All money is integer minor units (cents). Never floats.** Enforced via the
  `Money` primitive in `@gem/types`. Non-integer physical quantities use scaled
  integers too (e.g. carat stored as `carat_milli`).
- Every bid/money mutation runs inside a DB transaction.
- Invariants enforced at the DB level via CHECK constraints, not just app code.
- Shared types live in `@gem/types` and are imported by web, mobile, and api.
- Migrations only — no manual schema edits.

## Build order

1. ✅ Scaffold monorepo, tooling, shared config, CI (lint + typecheck + test).
2. Drizzle schema + SQL migrations + seed + PGlite test harness.
3. `placeBid` transactional logic + concurrency test suite.
4. Auth (register, login, refresh, profile).
5. Gem listings + media pre-signed upload flow.
6. Auctions API + Socket.IO live bid updates.
7. Server-driven auction close + notifications.
8. `resolvePostingFee` + posting fee gate on listing creation.
9. Web (Next.js) UI.
10. Mobile (Expo) UI.
