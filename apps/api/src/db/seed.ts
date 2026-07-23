import { pathToFileURL } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import { createPoolDatabase, type Schema } from "./client.js";
import { runMigrations } from "./migrate.js";
import { appSettings } from "./schema.js";

/**
 * Default posting-fee configuration. Seeded as FREE so that listing creation is
 * free out of the box; flipping to paid is a pure data change (no code change,
 * no redeploy) — see the resolvePostingFee step.
 */
export const DEFAULT_POSTING_FEE = {
  enabled: false,
  amount: 0,
  currency: "USD",
  free_until: null,
  free_quota: 0,
} as const;

/** Insert baseline app_settings rows. Idempotent (no-op if already present). */
export async function seedCoreSettings<T extends PgQueryResultHKT>(
  db: PgDatabase<T, Schema>,
): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: "posting_fee", value: { ...DEFAULT_POSTING_FEE } })
    .onConflictDoNothing();
}

/** CLI entry: migrate + seed a real database referenced by DATABASE_URL. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to seed a database. Aborting.");
    process.exitCode = 1;
    return;
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    const { db, driver } = createPoolDatabase(pool);
    const ran = await runMigrations(driver);
    console.warn(`Applied ${ran.length} migration(s): ${ran.join(", ") || "(none pending)"}`);
    await seedCoreSettings(db);
    console.warn("Seeded core app_settings (posting_fee).");
  } finally {
    await pool.end();
  }
}

// Run only when invoked directly (tsx src/db/seed.ts), not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
