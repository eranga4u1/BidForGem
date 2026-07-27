/**
 * DEV runner for the FULL NestJS API (HTTP + Socket.IO) against a real embedded
 * PostgreSQL — no Docker, one process. Run with:
 *
 *   pnpm --filter @gem/api dev:api
 *
 * Uses DATABASE_URL if set; otherwise boots an ephemeral embedded PG. Sets an
 * INSECURE dev JWT secret (loudly) only when JWT_ACCESS_SECRET is unset.
 */
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { createPoolDatabase } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { seedCoreSettings } from "../db/seed.js";
import { AppModule } from "../http/app.module.js";

async function main(): Promise<void> {
  let stopDb: () => Promise<void> = () => Promise.resolve();

  if (!process.env.DATABASE_URL) {
    const databaseDir = mkdtempSync(join(tmpdir(), "gem-api-"));
    const pgPort = 5000 + Math.floor(Math.random() * 2000);
    const epg = new EmbeddedPostgres({
      databaseDir,
      user: "postgres",
      password: "postgres",
      port: pgPort,
      persistent: false,
    });
    await epg.initialise();
    await epg.start();
    await epg.createDatabase("gem");
    process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${pgPort}/gem`;
    stopDb = () => epg.stop();
    console.warn(`[dev-api] embedded PostgreSQL on port ${pgPort}`);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const { db, driver } = createPoolDatabase(pool);
  await runMigrations(driver);
  await seedCoreSettings(db);
  await pool.end();

  if (!process.env.JWT_ACCESS_SECRET) {
    process.env.JWT_ACCESS_SECRET = "dev-only-insecure-secret-000000000000000000";
    console.warn("[dev-api] JWT_ACCESS_SECRET not set — using an INSECURE dev secret.");
  }
  // Use in-process local object storage so browser uploads work end to end.
  const port = Number(process.env.PORT ?? 4000);
  process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER ?? "local";
  process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL ?? `http://localhost:${port}`;

  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  await app.listen(port);
  console.warn(
    `[dev-api] Gem API listening on http://localhost:${port} (CORS: ${origins.join(", ")})`,
  );

  const shutdown = (): void => {
    void app.close().finally(() => void stopDb().finally(() => process.exit(0)));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
