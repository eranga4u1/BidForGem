import type { AuthTokens, PublicUser } from "@gem/types";
import { API_BASE_URL } from "./config";

const ACCESS_KEY = "gem.accessToken";
const REFRESH_KEY = "gem.refreshToken";

export interface AuthSessionResponse {
  user: PublicUser;
  tokens: AuthTokens;
}

/** A failed API call carrying the server's error reason + any zod issues. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    readonly issues?: unknown,
  ) {
    super(reason);
    this.name = "ApiError";
  }
}

export const tokenStore = {
  get access(): string | null {
    return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
  },
  set(tokens: AuthTokens): void {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
}

async function parseError(res: Response): Promise<ApiError> {
  const data = (await res.json().catch(() => null)) as { error?: string; issues?: unknown } | null;
  return new ApiError(res.status, data?.error ?? `HTTP_${res.status}`, data?.issues);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = false, retry = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth && tokenStore.access) headers.authorization = `Bearer ${tokenStore.access}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Transparently refresh once on an expired/invalid access token.
  if (res.status === 401 && auth && retry && tokenStore.refresh) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...options, retry: false });
  }

  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;
  try {
    const res = await request<AuthSessionResponse>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      retry: false,
    });
    tokenStore.set(res.tokens);
    return true;
  } catch {
    tokenStore.clear();
    return false;
  }
}

export const authApi = {
  register(input: { name: string; email: string; password: string }): Promise<AuthSessionResponse> {
    return request<AuthSessionResponse>("/auth/register", { method: "POST", body: input });
  },
  login(input: { email: string; password: string }): Promise<AuthSessionResponse> {
    return request<AuthSessionResponse>("/auth/login", { method: "POST", body: input });
  },
  me(): Promise<{ user: PublicUser }> {
    return request<{ user: PublicUser }>("/auth/me", { auth: true });
  },
  updateName(name: string): Promise<AuthSessionResponse | { ok: true; user: PublicUser }> {
    return request("/auth/me", { method: "PATCH", body: { name }, auth: true });
  },
  async logout(): Promise<void> {
    const refreshToken = tokenStore.refresh;
    if (refreshToken) {
      await request<{ ok: true }>("/auth/logout", {
        method: "POST",
        body: { refreshToken },
      }).catch(() => undefined);
    }
    tokenStore.clear();
  },
};
