import {
  createGemApiClient,
  GemApiError,
  UnauthenticatedError,
  type TokenStorage,
} from "@gem/api-client";
import { API_URL } from "./config";

/**
 * Token handling: the ACCESS token lives in memory inside the client (lost on
 * reload, re-derived via refresh) so an XSS payload can't read it from storage.
 * The long-lived REFRESH token is persisted in localStorage via this adapter —
 * the API returns tokens as JSON (no httpOnly-cookie flow), so this is the
 * available option; a production hardening would move the refresh token to an
 * httpOnly cookie (requires an API change).
 *
 * All the refresh/single-flight/401-retry logic now lives in @gem/api-client, so
 * web and mobile share ONE implementation and cannot drift.
 */
const REFRESH_KEY = "gem.refreshToken";

const storage: TokenStorage = {
  getRefreshToken: () =>
    Promise.resolve(typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY)),
  setRefreshToken: (token) => {
    if (typeof window !== "undefined") localStorage.setItem(REFRESH_KEY, token);
    return Promise.resolve();
  },
  clear: () => {
    if (typeof window !== "undefined") localStorage.removeItem(REFRESH_KEY);
    return Promise.resolve();
  },
};

export const api = createGemApiClient({ baseUrl: API_URL, storage });

/** Read-only view of the current access token, for the realtime socket handshake. */
export const tokens = {
  get access(): string | null {
    return api.getAccessToken();
  },
};

export { GemApiError, UnauthenticatedError };
