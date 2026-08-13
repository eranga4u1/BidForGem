/**
 * API + socket base URLs. Overridable per build via EXPO_PUBLIC_* env vars
 * (inlined by Expo at build time); defaults to the hosted Render API so the app
 * works on a device out of the box.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://bidforgem.onrender.com";
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? API_URL;
