"use client";

import { useState, useCallback } from "react";

/** Boolean flag persisted in localStorage. */
export function usePersistedFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [value, setValueState] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return fallback;
      return stored === "true";
    } catch {
      return fallback;
    }
  });

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

/** Numeric value persisted in localStorage. */
export function usePersistedNumber(key: string, fallback: number): [number, (value: number) => void] {
  const [value, setValueState] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed)) return parsed;
      }
    } catch {
      // localStorage unavailable — ignore
    }
    return fallback;
  });

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
