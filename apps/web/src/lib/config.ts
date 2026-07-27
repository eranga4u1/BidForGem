/** Base URL of the Gem API. Env-driven — no hardcoded host in shipped code. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
  /\/+$/,
  "",
);

/** Socket.IO origin (defaults to the API origin). */
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL;
