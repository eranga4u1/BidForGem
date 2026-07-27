import { z } from "zod";
import {
  authTokensSchema,
  bidHistoryItemSchema,
  postingFeeValueSchema,
  publicAuctionSchema,
  publicGemSchema,
  publicMediaSchema,
  publicNotificationSchema,
  publicUserSchema,
  type AuthTokens,
  type BidHistoryItem,
  type PublicAuction,
  type PublicGem,
  type PublicMedia,
  type PublicNotification,
  type PublicUser,
} from "@gem/types";

/** An error carrying the API's typed error envelope (code + optional details). */
export class GemApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "GemApiError";
  }
}

export interface GemApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | undefined | null>;

const session = z.object({ ok: z.literal(true), user: publicUserSchema, tokens: authTokensSchema });
const userEnv = z.object({ ok: z.literal(true), user: publicUserSchema });
const gemEnv = z.object({ ok: z.literal(true), gem: publicGemSchema });
const gemsEnv = z.object({
  ok: z.literal(true),
  items: z.array(publicGemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
const uploadTicketEnv = z.object({
  ok: z.literal(true),
  ticket: z.object({
    mediaId: z.string(),
    url: z.string(),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.coerce.date(),
  }),
});
const mediaEnv = z.object({ ok: z.literal(true), media: publicMediaSchema });
const readUrlEnv = z.object({
  ok: z.literal(true),
  url: z.string(),
  expiresAt: z.coerce.date().nullable(),
});
const auctionEnv = z.object({ ok: z.literal(true), auction: publicAuctionSchema });
const auctionsEnv = z.object({
  ok: z.literal(true),
  items: z.array(publicAuctionSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
const bidHistoryEnv = z.object({
  ok: z.literal(true),
  items: z.array(bidHistoryItemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
const notificationsEnv = z.object({
  ok: z.literal(true),
  items: z.array(publicNotificationSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
const settingsEnv = z.object({ ok: z.literal(true), settings: postingFeeValueSchema });
const okEnv = z.object({ ok: z.literal(true) });

export interface GemApiClient {
  auth: {
    register(input: { name: string; email: string; password: string }): Promise<AuthSession>;
    login(input: { email: string; password: string }): Promise<AuthSession>;
    refresh(refreshToken: string): Promise<AuthSession>;
    logout(refreshToken: string): Promise<void>;
    me(): Promise<PublicUser>;
    updateMe(name: string): Promise<PublicUser>;
  };
  gems: {
    list(filter?: Query): Promise<{ items: PublicGem[]; limit: number; offset: number }>;
    get(id: string): Promise<PublicGem>;
    create(input: unknown): Promise<PublicGem>;
    update(id: string, input: unknown): Promise<PublicGem>;
    remove(id: string): Promise<void>;
    publish(id: string): Promise<PublicGem>;
  };
  media: {
    requestUpload(
      gemId: string,
      input: { type: string; mime: string; sizeBytes: number; filename?: string },
    ): Promise<UploadTicket>;
    complete(gemId: string, mediaId: string): Promise<PublicMedia>;
    remove(gemId: string, mediaId: string): Promise<void>;
    readUrl(gemId: string, mediaId: string): Promise<{ url: string; expiresAt: Date | null }>;
  };
  auctions: {
    list(filter?: Query): Promise<{ items: PublicAuction[]; limit: number; offset: number }>;
    get(id: string): Promise<PublicAuction>;
    create(input: unknown): Promise<PublicAuction>;
    cancel(id: string): Promise<PublicAuction>;
    bids(
      id: string,
      query?: Query,
    ): Promise<{ items: BidHistoryItem[]; limit: number; offset: number }>;
    placeBid(id: string, amount: number): Promise<PublicAuction>;
  };
  notifications: {
    list(query?: Query): Promise<{ items: PublicNotification[]; limit: number; offset: number }>;
    markRead(id: string): Promise<void>;
    markAllRead(): Promise<void>;
  };
  admin: {
    updatePostingFee(input: unknown): Promise<unknown>;
  };
}

export interface AuthSession {
  user: PublicUser;
  tokens: AuthTokens;
}
export interface UploadTicket {
  mediaId: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}

export function createGemApiClient(options: GemApiClientOptions): GemApiClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch;

  async function req<T>(
    path: string,
    opts: {
      method?: string | undefined;
      body?: unknown;
      schema: z.ZodType<T>;
      auth?: boolean | undefined;
      query?: Query | undefined;
    },
  ): Promise<T> {
    const url = new URL(base + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.auth) {
      const token = await options.getAccessToken?.();
      if (token) headers.authorization = `Bearer ${token}`;
    }
    const init: RequestInit = { method: opts.method ?? "GET", headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    const res = await doFetch(url.toString(), init);
    const raw: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const env = raw as { error?: { code?: string; message?: string; details?: unknown } } | null;
      throw new GemApiError(
        res.status,
        env?.error?.code ?? `HTTP_${res.status}`,
        env?.error?.message ?? "Request failed.",
        env?.error?.details,
      );
    }
    return opts.schema.parse(raw);
  }

  return {
    auth: {
      register: (input) =>
        req("/auth/register", { method: "POST", body: input, schema: session }).then((r) => ({
          user: r.user,
          tokens: r.tokens,
        })),
      login: (input) =>
        req("/auth/login", { method: "POST", body: input, schema: session }).then((r) => ({
          user: r.user,
          tokens: r.tokens,
        })),
      refresh: (refreshToken) =>
        req("/auth/refresh", { method: "POST", body: { refreshToken }, schema: session }).then(
          (r) => ({ user: r.user, tokens: r.tokens }),
        ),
      logout: (refreshToken) =>
        req("/auth/logout", { method: "POST", body: { refreshToken }, schema: okEnv }).then(
          () => undefined,
        ),
      me: () => req("/auth/me", { auth: true, schema: userEnv }).then((r) => r.user),
      updateMe: (name) =>
        req("/auth/me", { method: "PATCH", body: { name }, auth: true, schema: userEnv }).then(
          (r) => r.user,
        ),
    },
    gems: {
      list: (filter) =>
        req("/gems", { schema: gemsEnv, query: filter }).then((r) => ({
          items: r.items,
          limit: r.limit,
          offset: r.offset,
        })),
      get: (id) => req(`/gems/${id}`, { schema: gemEnv }).then((r) => r.gem),
      create: (input) =>
        req("/gems", { method: "POST", body: input, auth: true, schema: gemEnv }).then(
          (r) => r.gem,
        ),
      update: (id, input) =>
        req(`/gems/${id}`, { method: "PATCH", body: input, auth: true, schema: gemEnv }).then(
          (r) => r.gem,
        ),
      remove: (id) =>
        req(`/gems/${id}`, { method: "DELETE", auth: true, schema: okEnv }).then(() => undefined),
      publish: (id) =>
        req(`/gems/${id}/publish`, { method: "POST", auth: true, schema: gemEnv }).then(
          (r) => r.gem,
        ),
    },
    media: {
      requestUpload: (gemId, input) =>
        req(`/gems/${gemId}/media/upload-url`, {
          method: "POST",
          body: input,
          auth: true,
          schema: uploadTicketEnv,
        }).then((r) => r.ticket),
      complete: (gemId, mediaId) =>
        req(`/gems/${gemId}/media/${mediaId}/complete`, {
          method: "POST",
          auth: true,
          schema: mediaEnv,
        }).then((r) => r.media),
      remove: (gemId, mediaId) =>
        req(`/gems/${gemId}/media/${mediaId}`, {
          method: "DELETE",
          auth: true,
          schema: okEnv,
        }).then(() => undefined),
      readUrl: (gemId, mediaId) =>
        req(`/gems/${gemId}/media/${mediaId}/url`, { auth: true, schema: readUrlEnv }).then(
          (r) => ({
            url: r.url,
            expiresAt: r.expiresAt,
          }),
        ),
    },
    auctions: {
      list: (filter) =>
        req("/auctions", { schema: auctionsEnv, query: filter }).then((r) => ({
          items: r.items,
          limit: r.limit,
          offset: r.offset,
        })),
      get: (id) => req(`/auctions/${id}`, { schema: auctionEnv }).then((r) => r.auction),
      create: (input) =>
        req("/auctions", { method: "POST", body: input, auth: true, schema: auctionEnv }).then(
          (r) => r.auction,
        ),
      cancel: (id) =>
        req(`/auctions/${id}/cancel`, { method: "POST", auth: true, schema: auctionEnv }).then(
          (r) => r.auction,
        ),
      bids: (id, query) =>
        req(`/auctions/${id}/bids`, { schema: bidHistoryEnv, query }).then((r) => ({
          items: r.items,
          limit: r.limit,
          offset: r.offset,
        })),
      placeBid: (id, amount) =>
        req(`/auctions/${id}/bids`, {
          method: "POST",
          body: { amount },
          auth: true,
          schema: auctionEnv,
        }).then((r) => r.auction),
    },
    notifications: {
      list: (query) =>
        req("/notifications", { auth: true, schema: notificationsEnv, query }).then((r) => ({
          items: r.items,
          limit: r.limit,
          offset: r.offset,
        })),
      markRead: (id) =>
        req(`/notifications/${id}/read`, { method: "POST", auth: true, schema: okEnv }).then(
          () => undefined,
        ),
      markAllRead: () =>
        req("/notifications/read-all", { method: "POST", auth: true, schema: okEnv }).then(
          () => undefined,
        ),
    },
    admin: {
      updatePostingFee: (input) =>
        req("/admin/settings/posting_fee", {
          method: "PATCH",
          body: input,
          auth: true,
          schema: settingsEnv,
        }),
    },
  };
}
