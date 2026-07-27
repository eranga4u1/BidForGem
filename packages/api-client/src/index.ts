import type { z } from "zod";

/**
 * @gem/api-client — a small, typed fetch layer shared by web and mobile.
 *
 * Step 1 establishes the transport primitive: a client that performs JSON
 * requests, injects auth headers, and validates responses with a zod schema at
 * the boundary. Concrete endpoint methods are added alongside the API in later
 * build-order steps.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: unknown,
  ) {
    super(`API request failed: ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  /** Base URL of the Gem API, e.g. https://api.gem.example */
  baseUrl: string;
  /** Returns the current access token, or null when unauthenticated. */
  getAccessToken?: () => string | null | Promise<string | null>;
  /** Injectable fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
}

export interface RequestOptions<TResponse> {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  /** zod schema used to validate & type the response body at the boundary. */
  schema: z.ZodType<TResponse>;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<TResponse>(options: RequestOptions<TResponse>): Promise<TResponse>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/+$/, "");

  return {
    async request<TResponse>({
      method = "GET",
      path,
      body,
      schema,
      signal,
    }: RequestOptions<TResponse>): Promise<TResponse> {
      const headers: Record<string, string> = { Accept: "application/json" };

      const token = await options.getAccessToken?.();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      let payload: string | undefined;
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }

      const url = `${base}/${path.replace(/^\/+/, "")}`;

      // Build init incrementally: exactOptionalPropertyTypes forbids passing an
      // explicit `undefined` for optional RequestInit fields like body/signal.
      const init: RequestInit = { method, headers };
      if (payload !== undefined) {
        init.body = payload;
      }
      if (signal) {
        init.signal = signal;
      }

      const response = await doFetch(url, init);

      const raw: unknown = response.status === 204 ? null : await response.json().catch(() => null);

      if (!response.ok) {
        throw new ApiError(response.status, response.statusText, raw);
      }

      return schema.parse(raw);
    },
  };
}

export * from "./gem-client.js";
