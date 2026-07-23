import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, createApiClient } from "./index.js";

function jsonResponse(body: unknown, init?: { status?: number; ok?: boolean }): Response {
  const status = init?.status ?? 200;
  return {
    ok: init?.ok ?? status < 400,
    status,
    statusText: "",
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("createApiClient", () => {
  const schema = z.object({ id: z.string(), amount: z.int() });

  it("builds the URL, sends JSON, and validates the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "g1", amount: 500 }));
    const client = createApiClient({ baseUrl: "https://api.gem.test/", fetch: fetchMock });

    const result = await client.request({
      method: "POST",
      path: "/gems",
      body: { title: "Ruby" },
      schema,
    });

    expect(result).toEqual({ id: "g1", amount: 500 });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.gem.test/gems");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe(JSON.stringify({ title: "Ruby" }));
  });

  it("attaches a bearer token when available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "g1", amount: 1 }));
    const client = createApiClient({
      baseUrl: "https://api.gem.test",
      fetch: fetchMock,
      getAccessToken: () => "tok-123",
    });

    await client.request({ path: "/me", schema });

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("throws ApiError on non-2xx responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "nope" }, { status: 403 }));
    const client = createApiClient({ baseUrl: "https://api.gem.test", fetch: fetchMock });

    await expect(client.request({ path: "/gems", schema })).rejects.toBeInstanceOf(ApiError);
  });
});
