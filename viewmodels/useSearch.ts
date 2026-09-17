"use client";

import { useEffect, useState } from "react";
import { normalizeSearchText, type SearchFilter, type SearchResponse } from "@/models/search";

/** Both search surfaces use the same ranked, tenant-scoped endpoint. */
export function useSearch(query: string, source: SearchFilter = "all", offset = 0, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data?: SearchResponse; error?: string }>({
    key: "",
  });
  const needle = normalizeSearchText(query);
  const key = JSON.stringify([needle, source, offset, enabled, attempt]);
  const active = enabled && Boolean(needle);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let disposed = false;
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: needle, source, offset, limit: 20 }),
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "暂时无法搜索，请重试");
        if (!disposed) setState({ key, data: body });
      } catch (error) {
        if (!disposed)
          setState({
            key,
            error: controller.signal.aborted
              ? "搜索超时，请重试"
              : error instanceof Error
                ? error.message
                : "暂时无法搜索，请重试",
          });
      } finally {
        clearTimeout(timeout);
      }
    }, 180);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, key, needle, offset, source]);
  const current = active && state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: active && (!current || (!state.data && !state.error)),
    retry: () => setAttempt((value) => value + 1),
  };
}
