import type { z } from "zod";
import {
  authSessionResponseSchema,
  userResponseSchema,
  gemResponseSchema,
  gemListResponseSchema,
  uploadTicketResponseSchema,
  mediaResponseSchema,
  mediaReadUrlResponseSchema,
  auctionResponseSchema,
  auctionListResponseSchema,
  bidHistoryResponseSchema,
  notificationListResponseSchema,
  postingFeeSettingsResponseSchema,
  okResponseSchema,
  errorEnvelopeSchema,
  type AuthSessionResponse,
  type AuthTokens,
  type BidHistoryItem,
  type PostingFeeSettings,
  type PostingFeeUpdateInput,
  type PublicAuction,
  type PublicGem,
  type PublicMedia,
  type PublicNotification,
  type PublicUser,
  type UploadTicket,
} from "@gem/contracts";
import { GemApiError, SchemaMismatchError, UnauthenticatedError } from "./errors.js";
import type { TokenStorage } from "./token-storage.js";

export interface GemApiClientOptions {
  /** Base URL of the Gem API, e.g. https://api.gem.example */
  baseUrl: string;
  /** Refresh-token persistence (web: localStorage, mobile: expo-secure-store). */
  storage: TokenStorage;
  /** Injectable fetch (defaults to global fetch). */
  fetch?: typeof fetch;
}

/** Options accepted by every request method. */
export interface RequestOptions {
  signal?: AbortSignal;
}

export interface AuthSession {
  user: PublicUser;
  tokens: AuthTokens;
}

type Query = Record<string, string | number | undefined | null>;
type Page<T> = { items: T[]; limit: number; offset: number };
type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type AuthMode = "none" | "optional" | "required";

export interface GemApiClient {
  /** The current in-memory access token (null when unauthenticated). Sync. */
  getAccessToken(): string | null;
  /** Whether a refresh token is currently persisted (e.g. to decide bootstrap). */
  hasRefreshToken(): Promise<boolean>;
  auth: {
    register(
      input: { name: string; email: string; password: string },
      opts?: RequestOptions,
    ): Promise<AuthSession>;
    login(input: { email: string; password: string }, opts?: RequestOptions): Promise<AuthSession>;
    me(opts?: RequestOptions): Promise<PublicUser>;
    updateMe(name: string, opts?: RequestOptions): Promise<PublicUser>;
    logout(opts?: RequestOptions): Promise<void>;
    /** Permanently delete the account (requires the password); clears local session. */
    deleteAccount(password: string, opts?: RequestOptions): Promise<void>;
    forgotPassword(email: string, opts?: RequestOptions): Promise<void>;
    resetPassword(token: string, password: string, opts?: RequestOptions): Promise<void>;
  };
  gems: {
    list(filter?: Query, opts?: RequestOptions): Promise<Page<PublicGem>>;
    get(id: string, opts?: RequestOptions): Promise<PublicGem>;
    create(input: unknown, opts?: RequestOptions): Promise<PublicGem>;
    update(id: string, input: unknown, opts?: RequestOptions): Promise<PublicGem>;
    remove(id: string, opts?: RequestOptions): Promise<void>;
    publish(id: string, opts?: RequestOptions): Promise<PublicGem>;
  };
  media: {
    requestUpload(
      gemId: string,
      input: { type: string; mime: string; sizeBytes: number; filename?: string },
      opts?: RequestOptions,
    ): Promise<UploadTicket>;
    complete(gemId: string, mediaId: string, opts?: RequestOptions): Promise<PublicMedia>;
    remove(gemId: string, mediaId: string, opts?: RequestOptions): Promise<void>;
    readUrl(
      gemId: string,
      mediaId: string,
      opts?: RequestOptions,
    ): Promise<{ url: string; expiresAt: Date | null }>;
  };
  auctions: {
    list(filter?: Query, opts?: RequestOptions): Promise<Page<PublicAuction>>;
    get(id: string, opts?: RequestOptions): Promise<PublicAuction>;
    create(input: unknown, opts?: RequestOptions): Promise<PublicAuction>;
    cancel(id: string, opts?: RequestOptions): Promise<PublicAuction>;
    bids(id: string, query?: Query, opts?: RequestOptions): Promise<Page<BidHistoryItem>>;
    placeBid(id: string, amount: number, opts?: RequestOptions): Promise<PublicAuction>;
  };
  notifications: {
    list(query?: Query, opts?: RequestOptions): Promise<Page<PublicNotification>>;
    markRead(id: string, opts?: RequestOptions): Promise<void>;
    markAllRead(opts?: RequestOptions): Promise<void>;
  };
  admin: {
    updatePostingFee(
      input: PostingFeeUpdateInput,
      opts?: RequestOptions,
    ): Promise<PostingFeeSettings>;
  };
}

interface RequestSpec<T> {
  method?: HttpMethod | undefined;
  path: string;
  body?: unknown;
  query?: Query | undefined;
  schema: z.ZodType<T>;
  auth?: AuthMode | undefined;
  signal?: AbortSignal | undefined;
}

export function createGemApiClient(options: GemApiClientOptions): GemApiClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch;
  const storage = options.storage;

  // The access token lives in memory only — never persisted.
  let accessToken: string | null = null;
  // Single-flight refresh: concurrent 401s collapse onto one in-flight promise.
  let refreshInFlight: Promise<string> | null = null;

  function page<T>(r: { items: T[]; limit: number; offset: number }): Page<T> {
    return { items: r.items, limit: r.limit, offset: r.offset };
  }

  async function send(
    method: HttpMethod,
    path: string,
    query: Query | undefined,
    body: unknown,
    token: string | null,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const url = new URL(base + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (signal) init.signal = signal;
    return doFetch(url.toString(), init);
  }

  /**
   * Rotate the session using the stored refresh token. On ANY failure the
   * refresh token is cleared exactly once and an UnauthenticatedError is thrown
   * — callers must not retry. Wrapped by {@link ensureRefreshed} for single-flight.
   */
  async function doRefresh(): Promise<string> {
    const rt = await storage.getRefreshToken();
    if (!rt) {
      accessToken = null;
      throw new UnauthenticatedError();
    }
    let res: Response;
    try {
      res = await send("POST", "/auth/refresh", undefined, { refreshToken: rt }, null, undefined);
    } catch {
      accessToken = null;
      await storage.clear();
      throw new UnauthenticatedError("Network error while refreshing the session.");
    }
    const raw: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      accessToken = null;
      await storage.clear();
      throw new UnauthenticatedError();
    }
    const parsed = authSessionResponseSchema.safeParse(raw);
    if (!parsed.success) {
      accessToken = null;
      await storage.clear();
      throw new SchemaMismatchError("POST /auth/refresh", parsed.error.issues, raw);
    }
    accessToken = parsed.data.tokens.accessToken;
    await storage.setRefreshToken(parsed.data.tokens.refreshToken);
    return accessToken;
  }

  function ensureRefreshed(): Promise<string> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function request<T>(spec: RequestSpec<T>): Promise<T> {
    const method = spec.method ?? "GET";
    const auth = spec.auth ?? "none";
    const endpoint = `${method} ${spec.path}`;

    // Ensure a token is available (or fail fast) before an authed call.
    if (auth === "required" && !accessToken) {
      await ensureRefreshed(); // throws UnauthenticatedError if impossible
    } else if (auth === "optional" && !accessToken && (await storage.getRefreshToken())) {
      // Opportunistic: attach identity if we can, but stay anonymous on failure.
      try {
        await ensureRefreshed();
      } catch {
        /* proceed unauthenticated */
      }
    }

    const tokenToSend = auth === "none" ? null : accessToken;
    let res = await send(method, spec.path, spec.query, spec.body, tokenToSend, spec.signal);

    // The token we sent was rejected — refresh once (single-flight) and replay.
    if (res.status === 401 && auth !== "none" && tokenToSend !== null) {
      const refreshed = await ensureRefreshed(); // throws UnauthenticatedError on failure
      res = await send(method, spec.path, spec.query, spec.body, refreshed, spec.signal);
    }

    const raw: unknown = res.status === 204 ? null : await res.json().catch(() => null);

    if (!res.ok) {
      const env = errorEnvelopeSchema.safeParse(raw);
      if (env.success) {
        throw new GemApiError(
          res.status,
          env.data.error.code,
          env.data.error.message,
          env.data.error.details,
          raw,
        );
      }
      throw new GemApiError(res.status, `HTTP_${res.status}`, "Request failed.", undefined, raw);
    }

    const parsed = spec.schema.safeParse(raw);
    if (!parsed.success) {
      throw new SchemaMismatchError(endpoint, parsed.error.issues, raw);
    }
    return parsed.data;
  }

  async function establish(res: AuthSessionResponse): Promise<AuthSession> {
    accessToken = res.tokens.accessToken;
    await storage.setRefreshToken(res.tokens.refreshToken);
    return { user: res.user, tokens: res.tokens };
  }

  return {
    getAccessToken: () => accessToken,
    hasRefreshToken: async () => (await storage.getRefreshToken()) !== null,

    auth: {
      register: (input, opts) =>
        request({
          method: "POST",
          path: "/auth/register",
          body: input,
          schema: authSessionResponseSchema,
          signal: opts?.signal,
        }).then(establish),
      login: (input, opts) =>
        request({
          method: "POST",
          path: "/auth/login",
          body: input,
          schema: authSessionResponseSchema,
          signal: opts?.signal,
        }).then(establish),
      me: (opts) =>
        request({
          path: "/auth/me",
          schema: userResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.user),
      updateMe: (name, opts) =>
        request({
          method: "PATCH",
          path: "/auth/me",
          body: { name },
          schema: userResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.user),
      logout: async (opts) => {
        const rt = await storage.getRefreshToken();
        if (rt) {
          await request({
            method: "POST",
            path: "/auth/logout",
            body: { refreshToken: rt },
            schema: okResponseSchema,
            signal: opts?.signal,
          }).catch(() => undefined);
        }
        accessToken = null;
        await storage.clear();
      },
      deleteAccount: async (password, opts) => {
        await request({
          method: "DELETE",
          path: "/auth/me",
          body: { password },
          schema: okResponseSchema,
          auth: "required",
          signal: opts?.signal,
        });
        accessToken = null;
        await storage.clear();
      },
      forgotPassword: (email, opts) =>
        request({
          method: "POST",
          path: "/auth/forgot-password",
          body: { email },
          schema: okResponseSchema,
          signal: opts?.signal,
        }).then(() => undefined),
      resetPassword: (token, password, opts) =>
        request({
          method: "POST",
          path: "/auth/reset-password",
          body: { token, password },
          schema: okResponseSchema,
          signal: opts?.signal,
        }).then(() => undefined),
    },

    gems: {
      list: (filter, opts) =>
        request({
          path: "/gems",
          query: filter,
          schema: gemListResponseSchema,
          signal: opts?.signal,
        }).then(page),
      // Send the token when present so an owner can read their own draft; an
      // anonymous caller simply omits it and still gets public listings.
      get: (id, opts) =>
        request({
          path: `/gems/${id}`,
          schema: gemResponseSchema,
          auth: "optional",
          signal: opts?.signal,
        }).then((r) => r.gem),
      create: (input, opts) =>
        request({
          method: "POST",
          path: "/gems",
          body: input,
          schema: gemResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.gem),
      update: (id, input, opts) =>
        request({
          method: "PATCH",
          path: `/gems/${id}`,
          body: input,
          schema: gemResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.gem),
      remove: (id, opts) =>
        request({
          method: "DELETE",
          path: `/gems/${id}`,
          schema: okResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then(() => undefined),
      publish: (id, opts) =>
        request({
          method: "POST",
          path: `/gems/${id}/publish`,
          schema: gemResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.gem),
    },

    media: {
      requestUpload: (gemId, input, opts) =>
        request({
          method: "POST",
          path: `/gems/${gemId}/media/upload-url`,
          body: input,
          schema: uploadTicketResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.ticket),
      complete: (gemId, mediaId, opts) =>
        request({
          method: "POST",
          path: `/gems/${gemId}/media/${mediaId}/complete`,
          schema: mediaResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.media),
      remove: (gemId, mediaId, opts) =>
        request({
          method: "DELETE",
          path: `/gems/${gemId}/media/${mediaId}`,
          schema: okResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then(() => undefined),
      readUrl: (gemId, mediaId, opts) =>
        request({
          path: `/gems/${gemId}/media/${mediaId}/url`,
          schema: mediaReadUrlResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => ({ url: r.url, expiresAt: r.expiresAt })),
    },

    auctions: {
      list: (filter, opts) =>
        request({
          path: "/auctions",
          query: filter,
          schema: auctionListResponseSchema,
          signal: opts?.signal,
        }).then(page),
      get: (id, opts) =>
        request({
          path: `/auctions/${id}`,
          schema: auctionResponseSchema,
          signal: opts?.signal,
        }).then((r) => r.auction),
      create: (input, opts) =>
        request({
          method: "POST",
          path: "/auctions",
          body: input,
          schema: auctionResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.auction),
      cancel: (id, opts) =>
        request({
          method: "POST",
          path: `/auctions/${id}/cancel`,
          schema: auctionResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.auction),
      bids: (id, query, opts) =>
        request({
          path: `/auctions/${id}/bids`,
          query,
          schema: bidHistoryResponseSchema,
          signal: opts?.signal,
        }).then(page),
      placeBid: (id, amount, opts) =>
        request({
          method: "POST",
          path: `/auctions/${id}/bids`,
          body: { amount },
          schema: auctionResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.auction),
    },

    notifications: {
      list: (query, opts) =>
        request({
          path: "/notifications",
          query,
          schema: notificationListResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then(page),
      markRead: (id, opts) =>
        request({
          method: "POST",
          path: `/notifications/${id}/read`,
          schema: okResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then(() => undefined),
      markAllRead: (opts) =>
        request({
          method: "POST",
          path: "/notifications/read-all",
          schema: okResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then(() => undefined),
    },

    admin: {
      updatePostingFee: (input, opts) =>
        request({
          method: "PATCH",
          path: "/admin/settings/posting_fee",
          body: input,
          schema: postingFeeSettingsResponseSchema,
          auth: "required",
          signal: opts?.signal,
        }).then((r) => r.settings),
    },
  };
}
