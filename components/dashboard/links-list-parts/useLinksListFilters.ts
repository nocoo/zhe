"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Folder, Link, LinkTag } from "@/models/types";

/**
 * Filter state + derived filtered/grouped data for the links list.
 *
 * Returns:
 *   - filterFolderId / filterTagIds       — bar filter state (mutually
 *                                            exclusive with sidebar param)
 *   - selectedFolderId                    — sidebar param (?folder=...)
 *   - linkTagsByLinkId                    — O(M) pre-grouped link→tags map
 *   - filteredLinks                       — links after all three filters
 *   - selectedFolder / headerTitle        — display helpers
 *   - hasActiveFilters / activeFilterCount
 *   - emptyLinkTags                       — shared empty array (referential)
 */
export function useLinksListFilters({
  links,
  linkTags,
  folders,
}: {
  links: Link[];
  linkTags: LinkTag[];
  folders: Folder[];
}) {
  const [filterFolderId, setFilterFolderId] = useState<string | null>(null);
  const [filterTagIds, setFilterTagIds] = useState<Set<string>>(new Set());

  const searchParams = useSearchParams();
  const selectedFolderId = searchParams.get("folder") ?? null;

  // Pre-group linkTags by linkId so each LinkCard receives only its own
  // tags — O(M) once instead of O(N×M) when every card filters the entire
  // array on each render.
  const linkTagsByLinkId = useMemo(() => {
    const map = new Map<number, LinkTag[]>();
    for (const lt of linkTags) {
      const arr = map.get(lt.linkId);
      if (arr) arr.push(lt);
      else map.set(lt.linkId, [lt]);
    }
    return map;
  }, [linkTags]);

  const emptyLinkTags = useMemo<LinkTag[]>(() => [], []);

  const filteredLinks = useMemo(() => {
    let result = links;

    // 1. Sidebar folder filter (URL param) takes precedence.
    if (selectedFolderId) {
      result =
        selectedFolderId === "uncategorized"
          ? result.filter((l) => l.folderId === null)
          : result.filter((l) => l.folderId === selectedFolderId);
    } else if (filterFolderId) {
      // 2. Filter-bar folder filter (only when sidebar hasn't selected one).
      result =
        filterFolderId === "uncategorized"
          ? result.filter((l) => l.folderId === null)
          : result.filter((l) => l.folderId === filterFolderId);
    }

    // 3. Tag filter — link must have ALL selected tags (intersection).
    if (filterTagIds.size > 0) {
      result = result.filter((link) => {
        const lt = linkTagsByLinkId.get(link.id);
        if (!lt) return false;
        const linkTagIdSet = new Set(lt.map((t) => t.tagId));
        for (const tagId of filterTagIds) {
          if (!linkTagIdSet.has(tagId)) return false;
        }
        return true;
      });
    }

    return result;
  }, [links, selectedFolderId, filterFolderId, filterTagIds, linkTagsByLinkId]);

  const selectedFolder = useMemo(() => {
    if (!selectedFolderId || selectedFolderId === "uncategorized") return null;
    return folders.find((f) => f.id === selectedFolderId) ?? null;
  }, [folders, selectedFolderId]);

  const headerTitle =
    selectedFolderId === "uncategorized"
      ? "Inbox"
      : selectedFolder
        ? selectedFolder.name
        : "全部链接";

  const hasActiveFilters = filterFolderId !== null || filterTagIds.size > 0;
  const activeFilterCount = (filterFolderId ? 1 : 0) + filterTagIds.size;

  const handleToggleFilterTag = useCallback((tagId: string) => {
    setFilterTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilterFolderId(null);
    setFilterTagIds(new Set());
  }, []);

  return {
    selectedFolderId,
    filterFolderId,
    setFilterFolderId,
    filterTagIds,
    handleToggleFilterTag,
    handleClearFilters,
    linkTagsByLinkId,
    emptyLinkTags,
    filteredLinks,
    selectedFolder,
    headerTitle,
    hasActiveFilters,
    activeFilterCount,
  };
}
