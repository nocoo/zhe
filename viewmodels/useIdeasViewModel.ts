"use client";

import { useState, useEffect, useCallback } from "react";
import type { IdeaListItem } from "@/lib/db/scoped";
import { getIdeas } from "@/actions/ideas";
import type { Tag } from "@/models/types";
import { useDashboardState, useDashboardActions } from "@/contexts/dashboard-service";
import { useIdeasMutations } from "./ideas/useIdeasMutations";
import { useIdeasFilters } from "./ideas/useIdeasFilters";

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

/** Fetch the user's ideas once on mount; expose ideas + setIdeas + refresh + loading. */
function useIdeasData() {
  const [ideas, setIdeas] = useState<IdeaListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchIdeas() {
      setLoading(true);
      try {
        const result = await getIdeas();
        if (cancelled) return;
        if (result.success && result.data) setIdeas(result.data);
      } catch (err) {
        console.error("Failed to fetch ideas:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchIdeas();
    return () => { cancelled = true; };
  }, []);

  const refreshIdeas = useCallback(async () => {
    const result = await getIdeas();
    if (result.success && result.data) setIdeas(result.data);
  }, []);

  return { ideas, setIdeas, loading, refreshIdeas };
}

/** Delete-confirm dialog state. */
function useDeleteConfirm() {
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [ideaToDelete, setIdeaToDelete] = useState<IdeaListItem | null>(null);

  const confirmDelete = useCallback((idea: IdeaListItem) => {
    setIdeaToDelete(idea);
    setIsDeleteConfirmOpen(true);
  }, []);

  const cancelDelete = useCallback(() => {
    setIdeaToDelete(null);
    setIsDeleteConfirmOpen(false);
  }, []);

  const reset = useCallback(() => {
    setIsDeleteConfirmOpen(false);
    setIdeaToDelete(null);
  }, []);

  return { isDeleteConfirmOpen, ideaToDelete, confirmDelete, cancelDelete, reset };
}

/**
 * Ideas ViewModel - manages ideas list, filtering, sorting, and CRUD operations.
 * Uses lazy-loading: ideas are fetched when the page is accessed, not on dashboard load.
 */
export function useIdeasViewModel() {
  const { ideas, setIdeas, loading, refreshIdeas } = useIdeasData();
  const [viewMode, setViewMode] = useState<IdeasViewMode>("grid");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { tags } = useDashboardState();
  const { handleIdeaCreated, handleIdeaUpdated, handleIdeaDeleted } = useDashboardActions();

  const filters = useIdeasFilters(ideas, tags, "updatedAt");
  const deleteConfirm = useDeleteConfirm();

  const mutations = useIdeasMutations(
    setIdeas,
    { handleIdeaCreated, handleIdeaUpdated, handleIdeaDeleted },
    () => setIsCreateModalOpen(false),
    () => deleteConfirm.reset(),
  );

  const executeDelete = useCallback(async () => {
    if (deleteConfirm.ideaToDelete) {
      await mutations.handleDeleteIdea(deleteConfirm.ideaToDelete.id);
    }
  }, [deleteConfirm.ideaToDelete, mutations]);

  const getTagById = useCallback(
    (tagId: string): Tag | undefined => tags.find((t) => t.id === tagId),
    [tags],
  );

  return {
    // State
    ideas: filters.filteredIdeas,
    allIdeas: ideas,
    loading,
    isSaving: mutations.isSaving,
    isDeleting: mutations.isDeleting,
    error: mutations.error,

    // View state
    viewMode, setViewMode,
    sortBy: filters.sortBy, setSortBy: filters.setSortBy,

    // Filter state
    searchQuery: filters.searchQuery, setSearchQuery: filters.setSearchQuery,
    selectedTagId: filters.selectedTagId, setSelectedTagId: filters.setSelectedTagId,
    clearFilters: filters.clearFilters,
    tagFilterOptions: filters.tagFilterOptions,

    // Modal state
    isCreateModalOpen, setIsCreateModalOpen,
    isDeleteConfirmOpen: deleteConfirm.isDeleteConfirmOpen,
    ideaToDelete: deleteConfirm.ideaToDelete,

    // Actions
    refreshIdeas,
    handleCreateIdea: mutations.handleCreateIdea,
    handleUpdateIdea: mutations.handleUpdateIdea,
    handleDeleteIdea: mutations.handleDeleteIdea,
    confirmDelete: deleteConfirm.confirmDelete,
    cancelDelete: deleteConfirm.cancelDelete,
    executeDelete,
    clearError: mutations.clearError,

    // Helpers
    getTagById,
    tags,
  };
}
