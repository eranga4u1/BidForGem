import { describe, expect, it, vi } from "vitest";
import { createGemApiClient } from "./gem-client.js";
import { createMemoryTokenStorage, type TokenStorage } from "./token-storage.js";
import { GemApiError, SchemaMismatchError, UnauthenticatedError } from "./errors.js";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ISO = "2026-01-02T03:04:05.000Z";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    statusText: "",
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function user(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: UUID,
    name: "Ada",
    email: "ada@example.com",
    role: "user",
    verified: true,
    createdAt: ISO,
    ...over,
  };
}

function session(accessToken: string, refreshToken: string): Record<string, unknown> {
  return {
    ok: true,
    user: user(),
    tokens: { accessToken, refreshToken, tokenType: "Bearer", expiresIn: 900 },
  };
}

function bearer(init: RequestInit | undefined): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.authorization;
}

describe("single-flight refresh", () => {
  it("collapses N concurrent 401s into exactly ONE refresh, then replays", async () => {
    let refreshCount = 0;
    const storage = createMemoryTokenStorage("rt0");

    const fetchMock = vi.fn((input: string | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/auth/refresh") && method === "POST") {
        refreshCount++;
        return Promise.resolve(jsonResponse(session("at2", "rt1")));
      }
      // Protected endpoints reject the stale token, accept the refreshed one.
      const token = bearer(init);
      if (token === "Bearer at2") {
        if (url.endsWith("/auth/me"))
          return Promise.resolve(jsonResponse({ ok: true, user: user() }));
        return Promise.resolve(jsonResponse({ ok: true, items: [], limit: 20, offset: 0 }));
      }
      return Promise.resolve(jsonResponse({ error: { code: "UNAUTHORIZED", message: "no" } }, 401));
    });

    const api = createGemApiClient({
      baseUrl: "https://api.test",
      storage,
      fetch: fetchMock as unknown as typeof fetch,
    });
    // Prime the in-memory access token with a stale value via login.
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(session("at1", "rt0"))));
    await api.auth.login({ email: "ada@example.com", password: "x" });

    // Two concurrent protected calls; both send the stale at1 and get 401.
    const [me, list] = await Promise.all([api.auth.me(), api.notifications.list()]);

    expect(refreshCount).toBe(1);
    expect(me.email).toBe("ada@example.com");
    expect(list.items).toEqual([]);
    // Storage rotated to the refreshed token.
    await expect(storage.getRefreshToken()).resolves.toBe("rt1");
  });
});

describe("refresh failure", () => {
  it("clears storage exactly once and throws UnauthenticatedError (no loop)", async () => {
    let refreshCount = 0;
    let clearCount = 0;
    const mem = createMemoryTokenStorage("rtX");
    const storage: TokenStorage = {
      getRefreshToken: () => mem.getRefreshToken(),
      setRefreshToken: (t) => mem.setRefreshToken(t),
      clear: () => {
        clearCount++;
        return mem.clear();
      },
    };

    const fetchMock = vi.fn((input: string | URL): Promise<Response> => {
      if (String(input).endsWith("/auth/refresh")) {
        refreshCount++;
        return Promise.resolve(
          jsonResponse({ error: { code: "INVALID_TOKEN", message: "no" } }, 401),
        );
      }
      return Promise.resolve(jsonResponse({ error: { code: "UNAUTHORIZED", message: "no" } }, 401));
    });

    const api = createGemApiClient({
      baseUrl: "https://api.test",
      storage,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(api.auth.me()).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(refreshCount).toBe(1);
    expect(clearCount).toBe(1);
    await expect(storage.getRefreshToken()).resolves.toBeNull();
  });
});

describe("response schema validation", () => {
  it("raises a descriptive SchemaMismatchError naming the endpoint and field", async () => {
    const storage = createMemoryTokenStorage(null);
    const fetchMock = vi.fn((input: string | URL): Promise<Response> => {
      if (String(input).endsWith("/auth/login"))
        return Promise.resolve(jsonResponse(session("at1", "rt1")));
      // /auth/me returns a malformed user (id is not a uuid).
      return Promise.resolve(jsonResponse({ ok: true, user: user({ id: "not-a-uuid" }) }));
    });
    const api = createGemApiClient({
      baseUrl: "https://api.test",
      storage,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await api.auth.login({ email: "ada@example.com", password: "x" });

    const err = await api.auth.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SchemaMismatchError);
    if (err instanceof SchemaMismatchError) {
      expect(err.endpoint).toBe("GET /auth/me");
      expect(err.message).toContain("user.id");
    }
  });
});

describe("error envelope", () => {
  it("throws a typed GemApiError carrying status, code, and body", async () => {
    const storage = createMemoryTokenStorage(null);
    const fetchMock = vi.fn((_input: string | URL, _init?: RequestInit): Promise<Response> =>
      Promise.resolve(
        jsonResponse({ error: { code: "GEM_NOT_FOUND", message: "Gem not found." } }, 404),
      ),
    );
    const api = createGemApiClient({
      baseUrl: "https://api.test",
      storage,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const err = await api.auctions.get("missing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GemApiError);
    if (err instanceof GemApiError) {
      expect(err.status).toBe(404);
      expect(err.code).toBe("GEM_NOT_FOUND");
    }
  });
});

describe("AbortSignal", () => {
  it("propagates the caller's signal to fetch", async () => {
    const storage = createMemoryTokenStorage(null);
    let seen: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: string | URL, init?: RequestInit): Promise<Response> => {
      seen = init?.signal ?? undefined;
      return Promise.resolve(jsonResponse({ ok: true, auction: auctionFixture() }));
    });
    const api = createGemApiClient({
      baseUrl: "https://api.test",
      storage,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const controller = new AbortController();
    await api.auctions.get("a1", { signal: controller.signal });
    expect(seen).toBe(controller.signal);
  });
});

function auctionFixture(): Record<string, unknown> {
  return {
    id: UUID,
    gemId: UUID,
    status: "active",
    currency: "USD",
    startPrice: 1000,
    reservePrice: null,
    minIncrement: 100,
    startAt: ISO,
    endAt: ISO,
    highestBid: null,
    bidCount: 0,
    antiSnipeWindowSeconds: 30,
    antiSnipeExtendSeconds: 30,
  };
}
