"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { IdeaListItem } from "@/lib/db/scoped";
import { getIdeas, createIdea, updateIdea, deleteIdea } from "@/actions/ideas";
import type { Tag } from "@/models/types";
import { useDashboardState, useDashboardActions } from "@/contexts/dashboard-service";

/** View mode for the ideas list */
export type IdeasViewMode = "grid" | "list";

/** Sort options for ideas */
export type IdeasSortBy = "updatedAt" | "createdAt";

/** Return type of useIdeasViewModel */
export type IdeasViewModel = ReturnType<typeof useIdeasViewModel>;

/** Filter options for ideas list */
export interface IdeasFilterOptions {
  query?: string;
  tagId?: string;
}

/**
 * Ideas ViewModel - manages ideas list, filtering, sorting, and CRUD operations.
 * Uses lazy-loading: ideas are fetched when the page is accessed, not on dashboard load.
 */
export function useIdeasViewModel() {
  // ── Local state (not from DashboardService - ideas are lazy-loaded) ──
  const [ideas, setIdeas] = useState<IdeaListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ── View state ──
  const [viewMode, setViewMode] = useState<IdeasViewMode>("grid");
  const [sortBy, setSortBy] = useState<IdeasSortBy>("updatedAt");

  // ── Filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  // ── Modal state ──
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [ideaToDelete, setIdeaToDelete] = useState<IdeaListItem | null>(null);

  // ── Mutation state ──
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Get tags from DashboardService ──
  const { tags } = useDashboardState();
  const { handleIdeaCreated, handleIdeaUpdated, handleIdeaDeleted } = useDashboardActions();

  // ── Fetch ideas on mount ──
  useEffect(() => {
    let cancelled = false;
    async function fetchIdeas() {
      setLoading(true);
      try {
        const result = await getIdeas();
        if (cancelled) return;
        if (result.success && result.data) {
          setIdeas(result.data);
        }
      } catch (err) {
        console.error("Failed to fetch ideas:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchIdeas();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Refresh ideas ──
  const refreshIdeas = useCallback(async () => {
    const result = await getIdeas();
    if (result.success && result.data) {
      setIdeas(result.data);
    }
  }, []);

  // ── Filtered and sorted ideas ──
  const filteredIdeas = useMemo(() => {
    let result = [...ideas];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (idea) =>
          (idea.title?.toLowerCase().includes(query) ?? false) ||
          (idea.excerpt?.toLowerCase().includes(query) ?? false),
      );
    }

    // Filter by tag
    if (selectedTagId) {
      result = result.filter((idea) => idea.tagIds.includes(selectedTagId));
    }

    // Sort
    result.sort((a, b) => {
      const dateA = sortBy === "updatedAt" ? a.updatedAt : a.createdAt;
      const dateB = sortBy === "updatedAt" ? b.updatedAt : b.createdAt;
      return dateB.getTime() - dateA.getTime();
    });

    return result;
  }, [ideas, searchQuery, selectedTagId, sortBy]);

  // ── Tag filter options (only tags that have ideas) ──
  const tagFilterOptions = useMemo(() => {
    const usedTagIds = new Set(ideas.flatMap((idea) => idea.tagIds));
    return tags.filter((tag) => usedTagIds.has(tag.id));
  }, [ideas, tags]);

  // ── Get tag by ID ──
  const getTagById = useCallback(
    (tagId: string): Tag | undefined => {
      return tags.find((t) => t.id === tagId);
    },
    [tags],
  );

  // ── Create idea ──
  const handleCreateIdea = useCallback(
    async (data: { content: string; title?: string; tagIds?: string[] }): Promise<boolean> => {
      setIsSaving(true);
      setError(null);
      try {
        const result = await createIdea(data);
        if (result.success && result.data) {
          // Convert IdeaDetail to IdeaListItem for local state
          const newIdea: IdeaListItem = {
            id: result.data.id,
            title: result.data.title,
            excerpt: result.data.excerpt,
            tagIds: result.data.tagIds,
            createdAt: result.data.createdAt,
            updatedAt: result.data.updatedAt,
          };
          setIdeas((prev) => [newIdea, ...prev]);
          handleIdeaCreated(newIdea);
          setIsCreateModalOpen(false);
          return true;
        }
        setError(result.error ?? "Failed to create idea");
        return false;
      } catch (err) {
        console.error("Failed to create idea:", err);
        setError("Failed to create idea");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [handleIdeaCreated],
  );

  // ── Update idea ──
  const handleUpdateIdea = useCallback(
    async (
      id: number,
      data: { content?: string; title?: string | null; tagIds?: string[] },
    ): Promise<boolean> => {
      setIsSaving(true);
      setError(null);
      try {
        const result = await updateIdea(id, data);
        if (result.success && result.data) {
          // Convert IdeaDetail to IdeaListItem for local state
          const updatedIdea: IdeaListItem = {
            id: result.data.id,
            title: result.data.title,
            excerpt: result.data.excerpt,
            tagIds: result.data.tagIds,
            createdAt: result.data.createdAt,
            updatedAt: result.data.updatedAt,
          };
          setIdeas((prev) =>
            prev.map((idea) => (idea.id === id ? updatedIdea : idea)),
          );
          handleIdeaUpdated(updatedIdea);
          return true;
        }
        setError(result.error ?? "Failed to update idea");
        return false;
      } catch (err) {
        console.error("Failed to update idea:", err);
        setError("Failed to update idea");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [handleIdeaUpdated],
  );

  // ── Delete idea ──
  const handleDeleteIdea = useCallback(
    async (id: number): Promise<boolean> => {
      setIsDeleting(true);
      setError(null);
      try {
        const result = await deleteIdea(id);
        if (result.success) {
          setIdeas((prev) => prev.filter((idea) => idea.id !== id));
          handleIdeaDeleted(id);
          setIsDeleteConfirmOpen(false);
          setIdeaToDelete(null);
          return true;
        }
        setError(result.error ?? "Failed to delete idea");
        return false;
      } catch (err) {
        console.error("Failed to delete idea:", err);
        setError("Failed to delete idea");
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [handleIdeaDeleted],
  );

  // ── Confirm delete ──
  const confirmDelete = useCallback((idea: IdeaListItem) => {
    setIdeaToDelete(idea);
    setIsDeleteConfirmOpen(true);
  }, []);

  const cancelDelete = useCallback(() => {
    setIdeaToDelete(null);
    setIsDeleteConfirmOpen(false);
  }, []);

  const executeDelete = useCallback(async () => {
    if (ideaToDelete) {
      await handleDeleteIdea(ideaToDelete.id);
    }
  }, [ideaToDelete, handleDeleteIdea]);

  // ── Clear filters ──
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTagId(null);
  }, []);

  // ── Clear error ──
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    ideas: filteredIdeas,
    allIdeas: ideas,
    loading,
    isSaving,
    isDeleting,
    error,

    // View state
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,

    // Filter state
    searchQuery,
    setSearchQuery,
    selectedTagId,
    setSelectedTagId,
    clearFilters,
    tagFilterOptions,

    // Modal state
    isCreateModalOpen,
    setIsCreateModalOpen,
    isDeleteConfirmOpen,
    ideaToDelete,

    // Actions
    refreshIdeas,
    handleCreateIdea,
    handleUpdateIdea,
    handleDeleteIdea,
    confirmDelete,
    cancelDelete,
    executeDelete,
    clearError,

    // Helpers
    getTagById,
    tags,
  };
}
