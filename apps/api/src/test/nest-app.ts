import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { Test } from "@nestjs/testing";
import type { RateLimiter } from "../auth/rate-limit.js";
import { AppModule } from "../http/app.module.js";
import { AUTH_CONFIG, DB, RATE_LIMITER, STORAGE } from "../http/tokens.js";
import { createMemoryStorage } from "../storage/memory-provider.js";
import type { StorageProvider } from "../storage/provider.js";
import { makeTestAuthConfig } from "./auth-helpers.js";
import { makeTestDb, type AnyDb } from "./harness.js";

export interface TestApi {
  app: INestApplication;
  db: AnyDb;
  storage: StorageProvider;
  /** Base URL (normalized to IPv4) for socket.io-client. */
  url: string;
  close: () => Promise<void>;
}

export interface MakeTestApiOptions {
  /** Storage provider to bind; defaults to the in-memory fake. Pass the local
   *  provider to exercise the real PUT→serve HTTP round-trip. */
  storage?: StorageProvider;
}

/**
 * Boot the real Nest app (HTTP + Socket.IO) backed by a fresh PGlite database,
 * a storage provider (in-memory fake by default), and a cheap auth config. No
 * network/real infra.
 */
export async function makeTestApi(opts: MakeTestApiOptions = {}): Promise<TestApi> {
  const { db, close: closeDb } = await makeTestDb();
  const storage = opts.storage ?? createMemoryStorage();
  const config = makeTestAuthConfig();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(db)
    .overrideProvider(STORAGE)
    .useValue(storage)
    .overrideProvider(AUTH_CONFIG)
    .useValue(config)
    // Disable rate limiting in tests (many registrations share one IP).
    .overrideProvider(RATE_LIMITER)
    .useValue({ hit: () => true } satisfies RateLimiter)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.init();
  await app.listen(0);

  const rawUrl = await app.getUrl();
  const port = new URL(rawUrl).port;
  const url = `http://127.0.0.1:${port}`;

  return {
    app,
    db,
    storage,
    url,
    close: async () => {
      await app.close();
      await closeDb();
    },
  };
}
