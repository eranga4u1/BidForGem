import { createGemApiClient, GemApiError } from "@gem/api-client";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

/**
 * Token handling on mobile: the ACCESS token lives in memory only (re-derived
 * via refresh). The long-lived REFRESH token is persisted in the OS keychain /
 * keystore via expo-secure-store — the secure equivalent of the web's
 * localStorage, but encrypted at rest.
 */
let accessToken: string | null = null;
const REFRESH_KEY = "gem.refreshToken";

export const tokens = {
  get access(): string | null {
    return accessToken;
  },
  async getRefresh(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  async set(next: { accessToken: string; refreshToken: string }): Promise<void> {
    accessToken = next.accessToken;
    try {
      await SecureStore.setItemAsync(REFRESH_KEY, next.refreshToken);
    } catch {
      /* keychain unavailable — session survives in memory only */
    }
  },
  async clear(): Promise<void> {
    accessToken = null;
    try {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
};

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const rt = await tokens.getRefresh();
  if (!rt) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
      await tokens.clear();
      return null;
    }
    const data = (await res.json()) as { tokens: { accessToken: string; refreshToken: string } };
    await tokens.set(data.tokens);
    return data.tokens.accessToken;
  } catch {
    return null;
  }
}

/** Single-flight refresh (rotating refresh tokens — collapse concurrent callers). */
export function refreshSession(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = doRefresh().finally(() => {
    setTimeout(() => {
      refreshing = null;
    }, 2000);
  });
  return refreshing;
}

/** fetch wrapper that transparently refreshes once on a 401 for authed calls. */
const authedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) return res;
  const next = await refreshSession();
  if (!next) return res;
  headers.set("authorization", `Bearer ${next}`);
  return fetch(input, { ...init, headers });
};

export const api = createGemApiClient({
  baseUrl: API_URL,
  getAccessToken: () => accessToken,
  fetch: authedFetch,
});

export { GemApiError };
