# BidForGem

A tested MVP gem-auction platform: a **NestJS API** and a **Next.js web app**
that share typed domain contracts, with live, server-timed auctions over
Socket.IO. It covers the full seller → auction → bidder lifecycle — gem listings
with access-gated media, server-authoritative auction timing and close, live
bidding with anti-snipe extension, in-app + email notifications, and password
reset via an emailed single-use token. **Mobile and real payments are not built
yet** (see [Status](#status--not-yet-done)).

## Tech stack

| Concern        | Choice                                                            |
| -------------- | ----------------------------------------------------------------- |
| Monorepo       | pnpm workspaces + Turborepo                                       |
| API            | NestJS (HTTP + Socket.IO), framework-free domain logic            |
| Web            | Next.js (App Router, React)                                       |
| Database       | PostgreSQL 17 + Drizzle ORM (SQL migrations)                      |
| Realtime       | Socket.IO (`/auctions` namespace)                                 |
| Storage        | Pluggable: local (dev), S3 / Cloudflare R2 (target)               |
| Email          | Pluggable: log/no-op (dev/test), Resend (real, gated by a flag)   |
| Tests          | Vitest, with `@electric-sql/pglite` (Postgres-in-WASM) for DB     |
| Language/tools | TypeScript (strict, ESM), ESLint + Prettier, Conventional Commits |

Money is always **integer minor units (cents)** — never floats; non-integer
physical quantities use scaled integers too (carat stored as `carat_milli`).
Every bid/money mutation runs in a DB transaction, and the bidding path relies
on `SELECT … FOR UPDATE` row locking.

## Monorepo layout

```
apps/
  api    NestJS + Socket.IO API, Drizzle schema + SQL migrations, domain services
  web    Next.js web app (browse gems, manage listings, live auction room)
packages/
  types        Shared domain types + zod schemas   (@gem/types)
  api-client   Typed fetch client for web/mobile    (@gem/api-client)
  config       Shared ESLint / Prettier / tsconfig  (@gem/config)
```

> A mobile (Expo / React Native) app is planned but **not yet in the repo**; the
> shared `@gem/types` + `@gem/api-client` packages exist so it can drop in later.

## Prerequisites

- **Node.js ≥ 22.17** (see `.nvmrc`)
- **pnpm** via Corepack (`packageManager` is pinned in `package.json`)
- No local database required for a quick start — the API dev runner boots an
  ephemeral embedded PostgreSQL when `DATABASE_URL` is unset.

## Setup

```bash
# 1. Enable the pinned pnpm and install
corepack enable
pnpm install

# 2. Configure environment
cp .env.example .env          # fill in values; see comments in the file
# Web (Next.js) reads its NEXT_PUBLIC_* vars from apps/web/.env.local:
cp .env.example apps/web/.env.local   # keep only the NEXT_PUBLIC_* lines
```

Every environment variable the app reads is documented in
[`.env.example`](./.env.example), grouped by area (Database, Auth/JWT, Email,
Storage, Realtime/CORS, Scheduler, Settings), each marked required/optional with
its default. The API reads from the process environment (there is no dotenv
autoload) — export the vars in your shell or use a loader such as `direnv`.

**Migrations** apply automatically when the API starts (`dev:api` runs pending
SQL migrations and seeds core settings on boot) — there is no separate migrate
command.

## Run (dev)

Two processes. From the repo root:

```bash
# API on http://localhost:4000 (HTTP + Socket.IO).
# Add the scheduler flag so auctions close on time:
AUCTION_SCHEDULER_ENABLED=true pnpm --filter @gem/api dev:api

# Web on http://localhost:3000 (in a second terminal):
pnpm --filter @gem/web dev
```

The API applies migrations + seeds on boot. With `DATABASE_URL` set it uses that
Postgres; unset, it starts a throwaway embedded Postgres (data lost on restart).
With `STORAGE_DRIVER=local` (the dev default) uploaded media bytes live in the
API process memory and are served back over HTTP — they do **not** persist
across an API restart. Point `STORAGE_DRIVER=s3` at S3/R2 for persistence.

## Test

```bash
pnpm test                      # all packages (Turborepo)
pnpm --filter @gem/api test    # the API suite (~152 tests, Vitest + PGlite, no network)
pnpm --filter @gem/web test    # web component/unit tests

pnpm typecheck                 # tsc --noEmit across the graph
pnpm lint                      # eslint (flat config)
```

DB-backed tests run against in-process PGlite (a real Postgres compiled to
WASM), and email/storage use the log/in-memory fakes — the suite never hits the
network.

## Status / not yet done

This is a working, well-tested MVP — not production-ready. Honestly:

- **Mobile app** — not started. Shared types + API client are in place for it.
- **Payments & settlement** — the posting-fee gate is config-driven and auctions
  close with a recorded winner, but there is **no real payment integration and
  no winner → seller money movement** yet.
- **Deploy-time hardening (tracked):**
  - Socket.IO **Redis adapter** + `app_settings` cache invalidation for
    multi-instance deployments (in-memory now → single instance only).
  - **S3 / Cloudflare R2** for persistent media (the local dev provider keeps
    bytes in process memory).
  - **Managed PostgreSQL** (the dev-fallback embedded Postgres is ephemeral).

## Engineering standards

- TypeScript everywhere, `strict` on; no `any` without a justifying comment.
- Clean architecture: framework-free domain logic, thin transport/controllers.
- All money is integer minor units (cents); invariants enforced at the DB level
  via CHECK constraints, not just app code.
- Shared contracts live in `@gem/types`, imported by web (and future mobile).
- Migrations only — no manual schema edits. Conventional Commits (commitlint +
  husky).
