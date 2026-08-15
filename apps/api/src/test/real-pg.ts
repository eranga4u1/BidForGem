import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { createPoolDatabase, type Schema } from "../db/client.js";

/**
 * Swallow errors emitted by idle pool clients. During teardown `epg.stop()`
 * fast-shutdowns the server, which terminates any lingering connection with a
 * FATAL (57P01); pg surfaces that as a pool `error` event. Without a listener
 * Node would treat it as an uncaught exception and fail an otherwise-green run.
 * There is nothing to recover here — the pool is being torn down.
 */
function ignorePoolError(): void {
  /* intentionally empty */
}

export interface RealPg {
  db: NodePgDatabase<Schema>;
  pool: pg.Pool;
  /** How the server was obtained — for honest test reporting. */
  source: "DATABASE_URL" | "embedded-postgres";
  stop: () => Promise<void>;
}

/**
 * Obtain a REAL PostgreSQL with a multi-connection pool, for tests that need
 * genuine transaction parallelism (which single-connection PGlite cannot
 * provide). Prefers an external DATABASE_URL; otherwise boots an embedded
 * PostgreSQL 17 (real server, no Docker). Returns null if neither is available,
 * so the caller can skip loudly rather than report a false green.
 */
export async function startRealPg(): Promise<RealPg | null> {
  const externalUrl = process.env.DATABASE_URL;
  if (externalUrl) {
    const pool = new pg.Pool({ connectionString: externalUrl, max: 16 });
    pool.on("error", ignorePoolError);
    const { db } = createPoolDatabase(pool);
    return {
      db,
      pool,
      source: "DATABASE_URL",
      stop: async () => {
        await pool.end();
      },
    };
  }

  try {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const databaseDir = mkdtempSync(join(tmpdir(), "gem-pg-"));
    const port = 5000 + Math.floor(Math.random() * 2000);

    const epg = new EmbeddedPostgres({
      databaseDir,
      user: "postgres",
      password: "postgres",
      port,
      persistent: false,
    });
    await epg.initialise();
    await epg.start();
    await epg.createDatabase("gem_test");

    const pool = new pg.Pool({
      host: "localhost",
      port,
      user: "postgres",
      password: "postgres",
      database: "gem_test",
      max: 16,
    });
    pool.on("error", ignorePoolError);
    const { db } = createPoolDatabase(pool);

    return {
      db,
      pool,
      source: "embedded-postgres",
      stop: async () => {
        await pool.end();
        await epg.stop();
      },
    };
  } catch (err) {
    console.warn("[real-pg] Real PostgreSQL unavailable, concurrency test will skip:", err);
    return null;
  }
}
