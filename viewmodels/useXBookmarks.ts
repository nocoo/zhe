"use client";

import { useEffect, useRef, useState } from "react";
import { loadXBookmarks } from "@/actions/connector";
import { canonicalXPost } from "@/cli/src/connector/core";
import type { XBookmark } from "@/lib/connector/jobs";
import type { Link } from "@/models/types";

function syncMetadata(
  items: Map<number, XBookmark>,
  links: Link[],
  onUpdate: (link: Link) => void,
) {
  for (const item of items.values()) {
    const link = links.find((l) => l.id === item.linkId);
    const tweet = item.tweet;
    if (!link || !tweet || canonicalXPost(link.originalUrl)?.id !== tweet.id) continue;
    const title = `${tweet.author.name} (@${tweet.author.username})`;
    if (link.metaTitle !== title || link.metaDescription !== tweet.text)
      onUpdate({ ...link, metaTitle: title, metaDescription: tweet.text });
  }
}

export function useXBookmarks(
  links: Link[],
  onUpdate: (link: Link) => void,
): Map<number, XBookmark> {
  const [bookmarks, setBookmarks] = useState(new Map<number, XBookmark>());
  const latest = useRef(links);
  latest.current = links;
  const key = links
    .flatMap((link) => {
      const post = canonicalXPost(link.originalUrl);
      return post ? [`${link.id}:${post.id}`] : [];
    })
    .join(",");
  useEffect(() => {
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const targets = new Map(
      key
        .split(",")
        .filter(Boolean)
        .map((item) => {
          const [id, post] = item.split(":");
          return [Number(id), post];
        }),
    );
    const ids = [...targets.keys()];
    if (!ids.length) {
      setBookmarks(new Map());
      return;
    }
    const poll = async () => {
      if (running || cancelled || document.hidden) return;
      running = true;
      try {
        const next = new Map<number, XBookmark>();
        for (let offset = 0; offset < ids.length; offset += 80) {
          const result = await loadXBookmarks(ids.slice(offset, offset + 80));
          if (!result.success || cancelled) return;
          for (const item of result.data ?? []) {
            if (item.tweet && item.tweet.id !== targets.get(item.linkId)) continue;
            next.set(item.linkId, item);
          }
        }
        if (cancelled) return;
        setBookmarks(next);
        syncMetadata(next, latest.current, onUpdate);
      } catch {
        // Leave the last good cards visible; retry on the next foreground poll.
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
  }, [key, onUpdate]);
  return bookmarks;
}
