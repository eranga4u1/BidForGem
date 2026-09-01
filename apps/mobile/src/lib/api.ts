import {
  createGemApiClient,
  GemApiError,
  UnauthenticatedError,
  type TokenStorage,
} from "@gem/api-client";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

/**
 * Token handling on mobile: the ACCESS token lives in memory inside the client
 * (re-derived via refresh). The long-lived REFRESH token is persisted in the OS
 * keychain / keystore via expo-secure-store (encrypted at rest) through this
 * adapter. All refresh/single-flight/401-retry logic lives in @gem/api-client,
 * shared with web — one implementation, no drift.
 */
const REFRESH_KEY = "gem.refreshToken";

const storage: TokenStorage = {
  async getRefreshToken() {
    try {
      return await SecureStore.getItemAsync(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  async setRefreshToken(token) {
    try {
      await SecureStore.setItemAsync(REFRESH_KEY, token);
    } catch {
      /* keychain unavailable — session survives in memory only */
    }
  },
  async clear() {
    try {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    } catch {
      /* ignore */
    }
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
