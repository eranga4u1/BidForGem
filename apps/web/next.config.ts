import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Off: StrictMode double-invokes effects in dev, which would fire the
  // bootstrap token-refresh twice; rotating refresh tokens treat the second use
  // as reuse. The single-flight in lib/api still guards concurrent refreshes.
  reactStrictMode: false,
  // Serve the service worker from the app origin with the right scope/headers.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
