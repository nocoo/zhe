"use client";

/**
 * Public facade for link viewmodels. Implementations live in per-hook files
 * to keep each file small and each hook focused on a single concern. The
 * `useLinksViewModel` import path remains stable for consumers.
 */

import { useEffect, useRef } from "react";
import type { Link } from "@/models/types";
import { batchRefreshLinkMetadata } from "@/actions/links";

export { useLinkCardViewModel } from "./useLinkCardViewModel";
export { useCreateLinkViewModel } from "./useCreateLinkViewModel";
export {
  useInlineLinkEditViewModel,
  type EditLinkCallbacks,
} from "./useInlineLinkEditViewModel";

/** Determine whether a link needs auto-fetched metadata. */
function linkNeedsMetadata(link: Link): boolean {
  const hasMetadata = !!(link.metaTitle || link.metaDescription || link.metaFavicon);
  return !hasMetadata && !link.note;
}

/**
 * Hook that batch-refreshes metadata for all links that need it.
 *
 * Replaces the per-card `useEffect` that caused N+1 server action calls.
 * Should be called once at the list level (e.g. in `LinksList`).
 *
 * @param links      - The current list of links.
 * @param onUpdate   - Callback to update individual links in parent state.
 */
export function useAutoRefreshMetadata(
  links: Link[],
  onUpdate: (link: Link) => void,
) {
  const processedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const needsRefresh = links.filter(
      (link) => linkNeedsMetadata(link) && !processedRef.current.has(link.id),
    );
    if (needsRefresh.length === 0) return;

    const ids = needsRefresh.map((l) => l.id);
    for (const id of ids) processedRef.current.add(id);

    let cancelled = false;
    batchRefreshLinkMetadata(ids)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          for (const link of result.data) onUpdate(link);
        } else {
          // Batch failed — remove IDs so they can be retried on next render
          for (const id of ids) processedRef.current.delete(id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Network/unexpected error — allow retry on next render
        for (const id of ids) processedRef.current.delete(id);
        console.error("batchRefreshLinkMetadata failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [links, onUpdate]);
}
