"use client";

import { useCallback, useEffect, useState } from "react";

const VIEW_MODE_KEY = "zhe_links_view_mode";
export type ViewMode = "list" | "grid";

/** Track grid/list view-mode with localStorage persistence (SSR-safe). */
export function useViewMode(initial: ViewMode = "list") {
  const [viewMode, setViewMode] = useState<ViewMode>(initial);

  // Sync from localStorage AFTER hydration to avoid SSR mismatch.
  useEffect(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "grid" || stored === "list") {
      setViewMode(stored);
    }
  }, []);

  const setAndPersist = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // localStorage unavailable — ignore
    }
  }, []);

  return [viewMode, setAndPersist] as const;
}
