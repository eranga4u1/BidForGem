import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import pg from "pg";
import { createPoolDatabase } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { AppModule } from "./app.module.js";

/**
 * Bootstrap the Gem API (NestJS + Socket.IO). Requires DATABASE_URL.
 *
 * Pending SQL migrations are applied BEFORE the server accepts traffic. This is
 * idempotent and tracked in `_migrations`, so it is safe to run on every
 * deploy/restart. It does NOT seed data — the app fails safe (posting fee = FREE)
 * when `app_settings` is absent, so seeding stays an explicit, separate step.
 *
 * Single-instance assumption: migrations run per process start. If this ever
 * scales to >1 instance, gate this behind a Postgres advisory lock (or a
 * once-per-deploy release command) so concurrent boots don't race.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger("bootstrap");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to start the API.");

  const migrationPool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { driver } = createPoolDatabase(migrationPool);
    const applied = await runMigrations(driver);
    logger.log(
      applied.length > 0
        ? `Applied ${applied.length} migration(s): ${applied.join(", ")}`
        : "Database schema up to date",
    );
  } finally {
    await migrationPool.end();
  }

  const app = await NestFactory.create(AppModule);
  // Explicit Socket.IO adapter so the /auctions gateway works in production.
  app.useWebSocketAdapter(new IoAdapter(app));

  // CORS from env for the web/mobile origins (comma-separated). Defaults to
  // permissive when unset (dev only — set CORS_ORIGINS in production).
  const origins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length > 0 ? origins : true, credentials: true });

  const port = Number(process.env.PORT ?? 4000);
  // Bind all interfaces so container/PaaS platforms (Render) can route to it.
  await app.listen(port, "0.0.0.0");
  logger.log(`Gem API listening on :${port}`);
}

void bootstrap();
