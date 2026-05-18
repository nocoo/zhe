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
/** Compare draft state against the persisted snapshot. */
function computeIsDirty(
  idea: IdeaDetail | null,
  title: string | null,
  content: string,
  tagIds: string[],
): boolean {
  if (!idea) return false;
  if (title !== idea.title) return true;
  if (content !== idea.content) return true;
  const sortedCurrent = [...tagIds].sort();
  const sortedOriginal = [...idea.tagIds].sort();
  if (sortedCurrent.length !== sortedOriginal.length) return true;
  return sortedCurrent.some((id, i) => id !== sortedOriginal[i]);
}

function toListItem(d: IdeaDetail): IdeaListItem {
  return {
    id: d.id,
    title: d.title,
    excerpt: d.excerpt,
    tagIds: d.tagIds,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** Load an idea on mount / when ideaId changes; clears stale state on switch. */
function useIdeaFetch(ideaId: number) {
  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchIdea() {
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
    return () => { cancelled = true; };
  }, [ideaId]);

  return {
    idea, setIdea,
    loading,
    error, setError,
    notFound,
    title, setTitle,
    content, setContent,
    tagIds, setTagIds,
    lastSavedAt, setLastSavedAt,
  };
}

export function useIdeaEditorViewModel(ideaId: number) {
  const fetched = useIdeaFetch(ideaId);
  const { idea, setIdea, loading, error, setError, notFound, title, setTitle, content, setContent, tagIds, setTagIds, lastSavedAt, setLastSavedAt } = fetched;

  const [isSaving, setIsSaving] = useState(false);

  const { tags } = useDashboardState();
  const { handleIdeaUpdated } = useDashboardActions();

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Dirty tracking ──
  const isDirty = useCallback(
    (): boolean => computeIsDirty(idea, title, content, tagIds),
    [idea, title, content, tagIds],
  );

  // ── Save ──
  const save = useCallback(async (): Promise<boolean> => {
    if (!idea) return false;
    setIsSaving(true);
    setError(null);
    try {
      const result = await updateIdea(ideaId, { title, content, tagIds });
      if (!mountedRef.current) return false;
      if (result.success && result.data) {
        const updated = result.data;
        setIdea(updated);
        setLastSavedAt(new Date());
        handleIdeaUpdated(toListItem(updated));
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
  }, [idea, ideaId, title, content, tagIds, handleIdeaUpdated, setError, setIdea, setLastSavedAt]);

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
