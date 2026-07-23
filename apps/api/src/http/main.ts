import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

/** Bootstrap the Gem API (NestJS + Socket.IO). Requires DATABASE_URL. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // CORS from env for the web/mobile origins (comma-separated). Defaults to
  // permissive in dev when unset.
  const origins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length > 0 ? origins : true, credentials: true });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] Gem API listening on http://localhost:${port}`);
}

void bootstrap();
