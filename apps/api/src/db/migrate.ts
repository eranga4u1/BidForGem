import { readdir, readFile } from "node:fs/promises";
import type { SqlDriver } from "./client.js";

const migrationsDir = new URL("../../migrations/", import.meta.url);

/**
 * Apply pending SQL migrations in filename order. Idempotent: already-applied
 * files (tracked in `_migrations`) are skipped, so this is safe to call on both
 * fresh test databases and a persistent dev database.
 *
 * Returns the list of migration files that were applied by this call.
 */
export async function runMigrations(driver: SqlDriver): Promise<string[]> {
  await driver.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     );`,
  );

  const appliedRows = await driver.query(`SELECT name FROM _migrations;`);
  const applied = new Set(appliedRows.map((row) => String(row.name)));

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(new URL(file, migrationsDir), "utf8");
    await driver.exec(sql);
    // File names are repo-controlled constants, not user input.
    await driver.exec(`INSERT INTO _migrations (name) VALUES ('${file}');`);
    ran.push(file);
  }
  return ran;
}
