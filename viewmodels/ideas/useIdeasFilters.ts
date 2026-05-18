"use client";

import { useCallback, useMemo, useState } from "react";
import type { IdeaListItem } from "@/lib/db/scoped";
import type { Tag } from "@/models/types";
import type { IdeasSortBy } from "../useIdeasViewModel";

/**
 * Search/tag/sort state and the resulting filtered + sorted ideas list.
 * Separated from the main viewmodel to keep it focused.
 */
export function useIdeasFilters(ideas: IdeaListItem[], tags: Tag[], initialSortBy: IdeasSortBy) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<IdeasSortBy>(initialSortBy);

  const filteredIdeas = useMemo(() => {
    let result = [...ideas];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (idea) =>
          (idea.title?.toLowerCase().includes(query) ?? false) ||
          (idea.excerpt?.toLowerCase().includes(query) ?? false),
      );
    }

    if (selectedTagId) {
      result = result.filter((idea) => idea.tagIds.includes(selectedTagId));
    }

    result.sort((a, b) => {
      const dateA = sortBy === "updatedAt" ? a.updatedAt : a.createdAt;
      const dateB = sortBy === "updatedAt" ? b.updatedAt : b.createdAt;
      return dateB.getTime() - dateA.getTime();
    });

    return result;
  }, [ideas, searchQuery, selectedTagId, sortBy]);

  const tagFilterOptions = useMemo(() => {
    const usedTagIds = new Set(ideas.flatMap((idea) => idea.tagIds));
    return tags.filter((tag) => usedTagIds.has(tag.id));
  }, [ideas, tags]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTagId(null);
  }, []);

  return {
    searchQuery, setSearchQuery,
    selectedTagId, setSelectedTagId,
    sortBy, setSortBy,
    filteredIdeas,
    tagFilterOptions,
    clearFilters,
  };
}
