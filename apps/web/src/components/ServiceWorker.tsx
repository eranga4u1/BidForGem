"use client";

import { useEffect } from "react";

/** Registers the service worker once, on the client, after load. */
export function ServiceWorker(): null {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = (): void => {
      navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
        console.error("SW registration failed", err);
      });
    };
    // Register now if the page has already loaded (the effect can run after the
    // `load` event has fired), otherwise wait for it.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
