import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PGlite boots a Postgres WASM build; embedded-postgres downloads/starts a
    // real PG server. Both can exceed Vitest's 5s default on a cold run.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each DB-backed test file owns its own database; keep files isolated.
    fileParallelism: false,
  },
});
