import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // SWC transforms TypeScript with legacy decorators + emitted metadata, which
  // NestJS's dependency injection relies on (esbuild cannot emit that metadata).
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    // PGlite boots a Postgres WASM build; embedded-postgres starts a real PG
    // server. Both can exceed Vitest's 5s default on a cold run.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each DB-backed test file owns its own database; keep files isolated.
    fileParallelism: false,
  },
});
