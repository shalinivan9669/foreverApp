"use client";

import { useEffect, useRef } from "react";

/** Refresh only when the user returns; no background polling or overlapping requests. */
export function useRefreshOnReturn(refresh: () => Promise<void>, enabled = true) {
  const lastRefresh = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const onReturn = () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      const now = Date.now();
      if (now - lastRefresh.current < 15_000) return;
      lastRefresh.current = now;
      inFlight.current = true;
      // Callers retain their own error state and explicit retry controls.
      void refresh().catch(() => {}).finally(() => { inFlight.current = false; });
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [enabled, refresh]);
}
