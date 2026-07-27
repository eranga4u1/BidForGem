import { createGemApiClient, GemApiError } from "@gem/api-client";
import { API_URL } from "./config";

/**
 * Token handling: the ACCESS token lives in memory only (lost on reload,
 * re-derived via refresh) so an XSS payload can't read it from storage. The
 * long-lived REFRESH token is persisted in localStorage — the API returns
 * tokens as JSON (no httpOnly-cookie flow), so this is the available option; a
 * production hardening would move the refresh token to an httpOnly cookie
 * (requires an API change).
 */
let accessToken: string | null = null;
const REFRESH_KEY = "gem.refreshToken";

function getRefresh(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
}

export const tokens = {
  get access(): string | null {
    return accessToken;
  },
  get refresh(): string | null {
    return getRefresh();
  },
  set(next: { accessToken: string; refreshToken: string }): void {
    accessToken = next.accessToken;
    if (typeof window !== "undefined") localStorage.setItem(REFRESH_KEY, next.refreshToken);
  },
  clear(): void {
    accessToken = null;
    if (typeof window !== "undefined") localStorage.removeItem(REFRESH_KEY);
  },
};

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const rt = getRefresh();
  if (!rt) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
      tokens.clear();
      return null;
    }
    const data = (await res.json()) as { tokens: { accessToken: string; refreshToken: string } };
    tokens.set(data.tokens);
    return data.tokens.accessToken;
  } catch {
    return null;
  }
}

/**
 * Single-flight refresh. Refresh tokens ROTATE and the server treats a reused
 * token as theft (revokes the family), so two concurrent refreshes with the same
 * token would log the user out. We keep the in-flight promise cached for a short
 * cooldown so a burst of callers (React StrictMode double-invokes effects in dev;
 * app boot triggers several) collapses into ONE rotation.
 */
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
  if (!headers.has("authorization")) return res; // unauthenticated request
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
