/**
 * DEV-ONLY HTTP server for poking the auth domain by hand (curl / REST client).
 *
 * This is NOT the production API — the real HTTP layer is NestJS (step 6). It is
 * a thin, framework-free adapter over the existing auth service + guard, backed
 * by a real embedded PostgreSQL 17 (or DATABASE_URL if set). Run with:
 *
 *   pnpm --filter @gem/api dev:server
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { runMigrations } from "../db/migrate.js";
import { seedCoreSettings } from "../db/seed.js";
import { startRealPg } from "../test/real-pg.js";
import {
  authenticate,
  createAuthService,
  createInMemoryRateLimiter,
  loadAuthConfig,
} from "../auth/index.js";

const PORT = Number(process.env.PORT ?? 4000);

if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = "dev-only-insecure-secret-change-me-000000000000";
  console.warn(
    "[dev] JWT_ACCESS_SECRET not set — using an INSECURE dev secret. Never use this in production.",
  );
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function clientContext(req: IncomingMessage): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.socket.remoteAddress ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  };
}

async function main(): Promise<void> {
  const real = await startRealPg();
  if (!real) {
    console.error("[dev] Could not start a database (no DATABASE_URL and embedded PG failed).");
    process.exitCode = 1;
    return;
  }
  const { db } = real;
  const { driver } = await import("../db/client.js").then((m) => m.createPoolDatabase(real.pool));
  await runMigrations(driver);
  await seedCoreSettings(db);

  const config = loadAuthConfig();
  const rateLimiter = createInMemoryRateLimiter();
  const auth = createAuthService({ db, config, rateLimiter });

  // Map a typed rejection reason to an HTTP status code.
  const statusFor = (reason: string): number => {
    switch (reason) {
      case "INVALID_INPUT":
      case "REGISTRATION_FAILED":
        return 400;
      // 401s. USER_NOT_FOUND here is the guard case: a valid token whose subject
      // no longer exists — treat as unauthorized.
      case "INVALID_CREDENTIALS":
      case "INVALID_TOKEN":
      case "TOKEN_EXPIRED":
      case "TOKEN_REUSE_DETECTED":
      case "MISSING_TOKEN":
      case "USER_NOT_FOUND":
        return 401;
      case "RATE_LIMITED":
        return 429;
      default:
        return 400;
    }
  };

  const server = createServer((req, res) => {
    void handle(req, res).catch((err: unknown) => {
      console.error("[dev] handler error:", err);
      if (!res.headersSent) send(res, 500, { error: "INTERNAL_ERROR" });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const path = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;
    const ctx = clientContext(req);
    const route = `${method} ${path}`;

    // Permissive CORS for local development so the web PWA (a different origin,
    // e.g. http://localhost:3000) can call this server. Dev-only.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    res.setHeader("Access-Control-Max-Age", "600");
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    switch (route) {
      case "POST /auth/register": {
        const result = await auth.register(await readJson(req), ctx);
        return result.ok
          ? send(res, 201, result)
          : send(res, statusFor(result.reason), errorBody(result));
      }
      case "POST /auth/login": {
        const result = await auth.login(await readJson(req), ctx);
        return result.ok
          ? send(res, 200, result)
          : send(res, statusFor(result.reason), errorBody(result));
      }
      case "POST /auth/refresh": {
        const result = await auth.refresh(await readJson(req), ctx);
        return result.ok
          ? send(res, 200, result)
          : send(res, statusFor(result.reason), errorBody(result));
      }
      case "POST /auth/logout": {
        await auth.logout(await readJson(req));
        return send(res, 200, { ok: true });
      }
      case "GET /auth/me": {
        const authed = await authenticate({ db, config }, req.headers.authorization);
        return authed.ok
          ? send(res, 200, { ok: true, user: authed.user })
          : send(res, statusFor(authed.reason), errorBody(authed));
      }
      case "PATCH /auth/me": {
        const authed = await authenticate({ db, config }, req.headers.authorization);
        if (!authed.ok) return send(res, statusFor(authed.reason), errorBody(authed));
        const result = await auth.updateProfile(authed.user.id, await readJson(req));
        return result.ok
          ? send(res, 200, result)
          : send(res, statusFor(result.reason), errorBody(result));
      }
      default:
        return send(res, 404, { error: "NOT_FOUND", route });
    }
  }

  server.listen(PORT, () => {
    console.warn(`\n[dev] Gem auth server (${real.source}) listening on http://localhost:${PORT}`);
    console.warn(`[dev] Try:
  curl -s localhost:${PORT}/auth/register -H 'content-type: application/json' \\
    -d '{"name":"Ada","email":"ada@example.com","password":"Sapphire!Blue-42xz"}'
  curl -s localhost:${PORT}/auth/login -H 'content-type: application/json' \\
    -d '{"email":"ada@example.com","password":"Sapphire!Blue-42xz"}'
  curl -s localhost:${PORT}/auth/me -H 'authorization: Bearer <accessToken>'\n`);
  });

  const shutdown = (): void => {
    console.warn("\n[dev] shutting down…");
    server.close(() => {
      void real.stop().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** Never echo internals; return the reason (and validation issues when present). */
function errorBody(result: { reason: string; issues?: unknown }): Record<string, unknown> {
  const body: Record<string, unknown> = { error: result.reason };
  if (result.issues) body.issues = result.issues;
  return body;
}

await main();
