"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { IdeaDetail, IdeaListItem } from "@/lib/db/scoped";
import { getIdea, updateIdea } from "@/actions/ideas";
import { useDashboardState, useDashboardActions } from "@/contexts/dashboard-service";

/** Return type of useIdeaEditorViewModel */
export type IdeaEditorViewModel = ReturnType<typeof useIdeaEditorViewModel>;

/**
 * IdeaEditorViewModel — manages the state for the dedicated idea editor page.
 *
 * Responsibilities:
 * - Fetch IdeaDetail on mount via getIdea(id)
 * - Manage draft state (title, content, tagIds)
 * - Dirty tracking (compare draft against fetched snapshot)
 * - Save via updateIdea() server action
 * - Sync back to DashboardService via handleIdeaUpdated()
 */
export function useIdeaEditorViewModel(ideaId: number) {
  // ── Fetched snapshot (source of truth for dirty comparison) ──
  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ── Draft state ──
  const [title, setTitle] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);

  // ── Mutation state ──
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // ── Tags from DashboardService ──
  const { tags } = useDashboardState();
  const { handleIdeaUpdated } = useDashboardActions();

  // Track if component is mounted to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Fetch idea on mount ──
  useEffect(() => {
    let cancelled = false;
    async function fetchIdea() {
      // Reset ALL state immediately on ideaId change to prevent stale snapshot
      setIdea(null);
      setLastSavedAt(null);
      setTitle(null);
      setContent("");
      setTagIds([]);
      setError(null);
      setNotFound(false);
      setLoading(true);
      try {
        const result = await getIdea(ideaId);
        if (cancelled) return;
        if (result.success && result.data) {
          const detail = result.data;
          setIdea(detail);
          setTitle(detail.title);
          setContent(detail.content);
          setTagIds(detail.tagIds);
        } else {
          setNotFound(true);
          setError(result.error ?? "Idea not found");
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch idea:", err);
        setError("Failed to load idea");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchIdea();
    return () => {
      cancelled = true;
    };
  }, [ideaId]);

  // ── Dirty tracking ──
  const isDirty = useCallback((): boolean => {
    if (!idea) return false;
    if (title !== idea.title) return true;
    if (content !== idea.content) return true;
    // Compare tagIds as sorted arrays
    const sortedCurrent = [...tagIds].sort();
    const sortedOriginal = [...idea.tagIds].sort();
    if (sortedCurrent.length !== sortedOriginal.length) return true;
    return sortedCurrent.some((id, i) => id !== sortedOriginal[i]);
  }, [idea, title, content, tagIds]);

  // ── Save ──
  const save = useCallback(async (): Promise<boolean> => {
    if (!idea) return false;
    setIsSaving(true);
    setError(null);
    try {
      const result = await updateIdea(ideaId, {
        title,
        content,
        tagIds,
      });
      if (!mountedRef.current) return false;
      if (result.success && result.data) {
        const updated = result.data;
        // Update snapshot so dirty resets
        setIdea(updated);
        setLastSavedAt(new Date());
        // Sync to DashboardService
        const listItem: IdeaListItem = {
          id: updated.id,
          title: updated.title,
          excerpt: updated.excerpt,
          tagIds: updated.tagIds,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
        handleIdeaUpdated(listItem);
        return true;
      }
      setError(result.error ?? "Failed to save");
      return false;
    } catch (err) {
      if (!mountedRef.current) return false;
      console.error("Failed to save idea:", err);
      setError("Failed to save");
      return false;
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }, [idea, ideaId, title, content, tagIds, handleIdeaUpdated]);

  // ── Tag toggle helper ──
  const toggleTag = useCallback((tagId: string) => {
    setTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }, []);

  // ── Clear error ──
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Fetched state
    idea,
    loading,
    error,
    notFound,

    // Draft state
    title,
    setTitle,
    content,
    setContent,
    tagIds,
    toggleTag,

    // Dirty tracking
    isDirty,

    // Mutation
    isSaving,
    lastSavedAt,
    save,

    // Helpers
    tags,
    clearError,
  };
}
