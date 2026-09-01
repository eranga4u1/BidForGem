# @gem/api-client

The typed fetch layer shared by `apps/web` and `apps/mobile`. One implementation
of auth, refresh, and response validation, so the two apps cannot drift.

## Usage

```ts
import { createGemApiClient, type TokenStorage } from "@gem/api-client";

const storage: TokenStorage = {/* web: localStorage · mobile: expo-secure-store */};
const api = createGemApiClient({ baseUrl, storage });

await api.auth.login({ email, password }); // stores tokens
const me = await api.auth.me(); // auto-refreshes on 401
```

## What it does

- **Platform-neutral**: uses only the global `fetch`. Runs unchanged in Node, the
  browser, and Hermes. No `window`/`document`/`localStorage`/`navigator`, no React
  Native imports.
- **Injected config**: base URL and a `TokenStorage` adapter are passed at
  construction. The package reads no environment and touches no platform storage.
- **Tokens**: the access token is held in memory; only the refresh token is
  persisted, via the injected async `TokenStorage`.
- **Single-flight refresh**: N concurrent 401s trigger exactly one refresh; the
  rest wait on it and replay. Prevents refresh-token-reuse revocation.
- **Fail closed**: if refresh fails, storage is cleared exactly once and a single
  `UnauthenticatedError` is thrown — never a loop.
- **Schema-checked**: every response is parsed through its `@gem/contracts`
  schema. A mismatch throws a descriptive `SchemaMismatchError` naming the
  endpoint and failing field — the guard against envelope drift.
- **Typed errors**: `GemApiError` carries HTTP status, code, and parsed body.
- **Cancellable**: every method accepts an optional `{ signal }`.

## What must NOT go here

- ❌ Axios or any HTTP library — global `fetch` only.
- ❌ `window`, `document`, `localStorage`, `navigator`, or React Native imports —
  put platform storage behind a `TokenStorage` adapter in the app instead.
- ❌ Reading environment variables — inject `baseUrl` at construction.

## Build

`tsc` emits ESM + `.d.ts` + declaration maps to `dist/`. Runtime deps: `zod` and
`@gem/contracts`.
