"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SPECIAL_SOURCES,
  type SpecialSource,
  type SpecialSources,
} from "@/models/special-sources";

export const SPECIAL_SOURCES_KEY = "zhe_special_sources";
const changed = "zhe-special-sources-changed";

export function useSpecialSources() {
  const [sources, setSources] = useState<SpecialSources>(DEFAULT_SPECIAL_SOURCES);
  useEffect(() => {
    const sync = () => {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(SPECIAL_SOURCES_KEY) ?? "null");
        if (
          stored &&
          typeof stored === "object" &&
          "github" in stored &&
          "x" in stored &&
          typeof stored.github === "boolean" &&
          typeof stored.x === "boolean"
        ) {
          setSources({ github: stored.github, x: stored.x });
        } else setSources(DEFAULT_SPECIAL_SOURCES);
      } catch {
        setSources(DEFAULT_SPECIAL_SOURCES);
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(changed, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(changed, sync);
    };
  }, []);
  const update = useCallback((next: SpecialSources) => {
    setSources(next);
    try {
      localStorage.setItem(SPECIAL_SOURCES_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(changed));
    } catch {
      /* Keep the current view usable when storage is unavailable. */
    }
  }, []);
  const toggle = (source: SpecialSource) => update({ ...sources, [source]: !sources[source] });
  const reset = useCallback(() => update(DEFAULT_SPECIAL_SOURCES), [update]);
  return { sources, toggle, reset, changed: !sources.github || sources.x };
}
