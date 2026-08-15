/* Gem PWA service worker.
 *
 * Bump CACHE whenever this file changes so the new worker purges old caches on
 * activate. Content updates don't need a bump: HTML navigations and the manifest
 * are network-first, so a fresh deploy always wins immediately — no hard-refresh
 * required. Hashed build assets are immutable, so they're cache-first. */
const CACHE = "gem-v2";
const OFFLINE_FALLBACK = "/";
// Precache only stable assets + an offline fallback. NOT the app HTML shell —
// navigations are network-first, so we never want to serve a stale page online.
const PRECACHE = ["/", "/icon.svg", "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept the API (cross-origin auth server): always hit the network.
  if (url.origin !== self.location.origin) return;

  // App HTML + the manifest: network-first, so new deploys are picked up
  // immediately. Fall back to cache (offline) only when the network fails.
  if (request.mode === "navigate" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match(OFFLINE_FALLBACK)),
      ),
    );
    return;
  }

  // Immutable, content-hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
