/**
 * Persistence for the long-lived REFRESH token only. The access token is held
 * in memory by the client and never passed here.
 *
 * All methods are async: mobile persists via `expo-secure-store` (promise-based,
 * encrypted at rest); the web adapter wraps `localStorage` and resolves
 * synchronously. The client itself reads no environment and touches no
 * platform storage — an adapter is injected at construction.
 */
export interface TokenStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  /** Remove the stored refresh token (sign-out / refresh failure). */
  clear(): Promise<void>;
}

/** In-memory storage — used by tests and any non-persistent (Node) caller. */
export function createMemoryTokenStorage(initial?: string | null): TokenStorage {
  let token: string | null = initial ?? null;
  return {
    getRefreshToken: () => Promise.resolve(token),
    setRefreshToken: (next) => {
      token = next;
      return Promise.resolve();
    },
    clear: () => {
      token = null;
      return Promise.resolve();
    },
  };
}
