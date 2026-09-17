"use client";

import { useEffect, useRef } from "react";
import { loadScreenshotPreviews } from "@/actions/connector";
import { screenshotTarget } from "@/cli/src/connector/screenshot-core";
import type { Link } from "@/models/types";

/** Poll only missing previews, and merge into the latest link to preserve local edits. */
export function useScreenshotPreviews(links: Link[], onUpdate: (link: Link) => void) {
  const latest = useRef(links);
  latest.current = links;
  const targetsKey = JSON.stringify(
    links
      .filter((link) => !link.screenshotUrl?.trim() && screenshotTarget(link.originalUrl))
      .map((link) => [link.id, link.originalUrl]),
  );
  useEffect(() => {
    const targets = new Map<number, string>(JSON.parse(targetsKey));
    const ids = [...targets.keys()];
    if (!ids.length) return;
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (cancelled || running || document.hidden) return;
      running = true;
      try {
        for (let offset = 0; offset < ids.length; offset += 80) {
          const result = await loadScreenshotPreviews(ids.slice(offset, offset + 80));
          if (cancelled || !result.success) return;
          for (const preview of result.data ?? []) {
            const link = latest.current.find((link) => link.id === preview.id);
            if (
              link &&
              !link.screenshotUrl?.trim() &&
              link.originalUrl === preview.originalUrl &&
              targets.get(link.id) === preview.originalUrl
            )
              onUpdate({ ...link, screenshotUrl: preview.screenshotUrl });
          }
        }
      } catch {
        /* Keep the last good cards until the next foreground poll. */
      } finally {
        running = false;
        if (!cancelled) timer = setTimeout(poll, 15_000);
      }
    };
    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void poll();
      }
    };
    void poll();
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [targetsKey, onUpdate]);
}
