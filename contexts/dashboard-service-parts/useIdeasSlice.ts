"use client";

import { useCallback, useState } from "react";
import type { IdeaListItem } from "@/lib/db/scoped";
import { getIdeas } from "@/actions/ideas";

/**
 * Owns the ideas slice of the dashboard. Ideas are lazy-loaded (fetched the
 * first time the global search dialog opens) to keep initial page-load
 * lean for users who never touch the Ideas feature.
 */
export function useIdeasSlice() {
  const [ideas, setIdeas] = useState<IdeaListItem[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasLoaded, setIdeasLoaded] = useState(false);

  const ensureIdeasLoaded = useCallback(async () => {
    if (ideasLoaded || ideasLoading) return;
    setIdeasLoading(true);
    try {
      const result = await getIdeas();
      if (result.success && result.data) {
        setIdeas(result.data);
        setIdeasLoaded(true);
      }
    } catch (error) {
      console.error("Failed to load ideas:", error);
    } finally {
      setIdeasLoading(false);
    }
  }, [ideasLoaded, ideasLoading]);

  const refreshIdeas = useCallback(async () => {
    setIdeasLoading(true);
    try {
      const result = await getIdeas();
      if (result.success && result.data) setIdeas(result.data);
      setIdeasLoaded(true);
    } catch (error) {
      console.error("Failed to refresh ideas:", error);
    } finally {
      setIdeasLoading(false);
    }
  }, []);

  const handleIdeaCreated = useCallback((idea: IdeaListItem) => {
    setIdeas((prev) => [idea, ...prev]);
  }, []);
  const handleIdeaDeleted = useCallback((id: number) => {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  }, []);
  const handleIdeaUpdated = useCallback((updatedIdea: IdeaListItem) => {
    setIdeas((prev) => prev.map((i) => (i.id === updatedIdea.id ? updatedIdea : i)));
  }, []);

  return {
    ideas,
    ideasLoading,
    ensureIdeasLoaded,
    refreshIdeas,
    handleIdeaCreated,
    handleIdeaDeleted,
    handleIdeaUpdated,
  };
}
