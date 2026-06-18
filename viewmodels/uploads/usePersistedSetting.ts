"use client";

import { useState, useCallback, useEffect } from "react";

/**
 * Boolean flag persisted in localStorage. The initial render always returns
 * `fallback` so SSR HTML and the client's first paint match; the persisted
 * value is hydrated in a mount effect on the next tick. Without this split
 * SSR emits aria-checked="false" while the client immediately renders the
 * stored `true`, which Radix Switch flags as a hydration mismatch.
 */
export function usePersistedFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [value, setValueState] = useState(fallback);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return;
      setValueState(stored === "true");
    } catch {
      // localStorage unavailable — keep fallback
    }
  }, [key]);

  const setValue = useCallback(
    (next: boolean) => {
      setValueState(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // localStorage unavailable — ignore
      }
    },
    [key],
  );

  return [value, setValue];
}

/** Numeric value persisted in localStorage. Same SSR-safe hydration as usePersistedFlag. */
export function usePersistedNumber(key: string, fallback: number): [number, (value: number) => void] {
  const [value, setValueState] = useState(fallback);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return;
      const parsed = Number(stored);
      if (!Number.isNaN(parsed)) setValueState(parsed);
    } catch {
      // localStorage unavailable — keep fallback
    }
  }, [key]);

  const setValue = useCallback(
    (next: number) => {
      setValueState(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // localStorage unavailable — ignore
      }
    },
    [key],
  );

  return [value, setValue];
}
