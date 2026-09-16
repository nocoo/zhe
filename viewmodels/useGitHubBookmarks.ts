"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadGitHubBookmarks } from "@/actions/github-connector";
import { canonicalGitHubRepo } from "@/cli/src/connector/github-core";
import type { GitHubBookmark } from "@/lib/connector/github-jobs";
import type { Link } from "@/models/types";

function syncMetadata(
  items: Map<number, GitHubBookmark>,
  links: Link[],
  onUpdate: (link: Link) => void,
) {
  for (const [id, item] of items) {
    const link = links.find((link) => link.id === id && link.originalUrl === item.sourceUrl);
    const repo = item.repository;
    if (
      link &&
      repo &&
      (link.metaTitle !== repo.fullName || link.metaDescription !== repo.description)
    )
      onUpdate({ ...link, metaTitle: repo.fullName, metaDescription: repo.description });
  }
}

export function useGitHubBookmarks(links: Link[], onUpdate: (link: Link) => void) {
  const [bookmarks, setBookmarks] = useState(new Map<number, GitHubBookmark>());
  const pollRef = useRef(() => {});
  const latest = useRef(links);
  latest.current = links;
  const targetsKey = JSON.stringify(
    links
      .filter((link) => canonicalGitHubRepo(link.originalUrl))
      .map((link) => [link.id, link.originalUrl]),
  );
  const refresh = useCallback(() => pollRef.current(), []);
  useEffect(() => {
    const targets = new Map<number, string>(JSON.parse(targetsKey));
    const ids = [...targets.keys()];
    let cancelled = false;
    let running = false;
    const poll = async () => {
      if (cancelled || running || document.hidden) return;
      running = true;
      try {
        const next = new Map<number, GitHubBookmark>();
        for (let offset = 0; offset < ids.length; offset += 80) {
          const result = await loadGitHubBookmarks(ids.slice(offset, offset + 80));
          if (!result.success || cancelled) return;
          for (const item of result.data ?? []) {
            if (item.sourceUrl === targets.get(item.linkId)) next.set(item.linkId, item);
          }
        }
        if (cancelled) return;
        setBookmarks(next);
        syncMetadata(next, latest.current, onUpdate);
      } catch {
        /* Preserve the last successful snapshot until the next poll. */
      } finally {
        running = false;
      }
    };
    pollRef.current = () => {
      void poll();
    };
    void poll();
    const timer = ids.length ? setInterval(poll, 15_000) : undefined;
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [targetsKey, onUpdate]);
  return { bookmarks, refresh };
}
