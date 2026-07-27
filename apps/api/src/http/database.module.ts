import { Global, Module } from "@nestjs/common";
import pg from "pg";
import { createAuctionsService } from "../auctions/auctions-service.js";
import { createAuthService } from "../auth/auth-service.js";
import type { AuthConfig } from "../auth/config.js";
import { loadAuthConfig } from "../auth/config.js";
import { createInMemoryRateLimiter, type RateLimiter } from "../auth/rate-limit.js";
import { createPoolDatabase } from "../db/client.js";
import type { Db } from "../gems/access.js";
import { createGemsService } from "../gems/gems-service.js";
import { createMediaService } from "../gems/media-service.js";
import { createNotificationsService } from "../notifications/notifications-service.js";
import { createSettingsService, type SettingsService } from "../settings/settings-service.js";
import { createLocalStorage } from "../storage/local-provider.js";
import { createMemoryStorage } from "../storage/memory-provider.js";
import type { StorageProvider } from "../storage/provider.js";
import { createS3Storage } from "../storage/s3-provider.js";
import {
  AUCTIONS_SERVICE,
  AUTH_CONFIG,
  AUTH_SERVICE,
  DB,
  GEMS_SERVICE,
  MEDIA_SERVICE,
  NOTIFICATIONS_SERVICE,
  RATE_LIMITER,
  SETTINGS_SERVICE,
  STORAGE,
} from "./tokens.js";

/**
 * Wires the framework-free infra + domain services as providers. In tests, DB /
 * STORAGE / AUTH_CONFIG are overridden with a PGlite database, an in-memory
 * storage fake, and a cheap auth config.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL is required to start the API.");
        const pool = new pg.Pool({ connectionString: url });
        return createPoolDatabase(pool).db;
      },
    },
    {
      provide: STORAGE,
      useFactory: () => {
        if (process.env.STORAGE_DRIVER === "local") {
          return createLocalStorage({
            baseUrl: process.env.PUBLIC_API_URL ?? "http://localhost:4000",
          });
        }
        if (process.env.STORAGE_DRIVER === "s3") {
          const endpoint = process.env.S3_ENDPOINT;
          return createS3Storage({
            region: process.env.S3_REGION ?? "auto",
            ...(endpoint ? { endpoint } : {}),
            accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
            publicBucket: process.env.S3_PUBLIC_BUCKET ?? "gem-public",
            privateBucket: process.env.S3_PRIVATE_BUCKET ?? "gem-private",
            publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "https://cdn.example",
          });
        }
        return createMemoryStorage();
      },
    },
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
    { provide: RATE_LIMITER, useFactory: () => createInMemoryRateLimiter() },
    {
      provide: SETTINGS_SERVICE,
      useFactory: (db: Db) =>
        createSettingsService(db, { ttlMs: Number(process.env.SETTINGS_CACHE_TTL_MS ?? 60_000) }),
      inject: [DB],
    },
    {
      provide: AUTH_SERVICE,
      useFactory: (db: Db, config: AuthConfig, rateLimiter: RateLimiter) =>
        createAuthService({ db, config, rateLimiter }),
      inject: [DB, AUTH_CONFIG, RATE_LIMITER],
    },
    {
      provide: GEMS_SERVICE,
      useFactory: (db: Db, settings: SettingsService) => createGemsService({ db, settings }),
      inject: [DB, SETTINGS_SERVICE],
    },
    {
      provide: MEDIA_SERVICE,
      useFactory: (db: Db, storage: StorageProvider) => createMediaService({ db, storage }),
      inject: [DB, STORAGE],
    },
    {
      provide: AUCTIONS_SERVICE,
      useFactory: (db: Db) => createAuctionsService({ db }),
      inject: [DB],
    },
    {
      provide: NOTIFICATIONS_SERVICE,
      useFactory: (db: Db) => createNotificationsService({ db }),
      inject: [DB],
    },
  ],
  exports: [
    DB,
    STORAGE,
    AUTH_CONFIG,
    RATE_LIMITER,
    AUTH_SERVICE,
    GEMS_SERVICE,
    MEDIA_SERVICE,
    AUCTIONS_SERVICE,
    NOTIFICATIONS_SERVICE,
    SETTINGS_SERVICE,
  ],
})
export class DatabaseModule {}
