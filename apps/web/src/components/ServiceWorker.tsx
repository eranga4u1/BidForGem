"use client";

import { useEffect } from "react";

/** Registers the service worker once, on the client, after load. */
export function ServiceWorker(): null {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onLoad = (): void => {
      navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
        console.error("SW registration failed", err);
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
