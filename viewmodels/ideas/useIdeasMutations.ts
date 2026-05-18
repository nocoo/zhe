"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { IdeaListItem } from "@/lib/db/scoped";
import { createIdea, updateIdea, deleteIdea } from "@/actions/ideas";

interface DashboardCallbacks {
  handleIdeaCreated: (idea: IdeaListItem) => void;
  handleIdeaUpdated: (idea: IdeaListItem) => void;
  handleIdeaDeleted: (id: number) => void;
}

/** Project an idea detail row down to the lightweight list shape. */
function toListItem(data: {
  id: number;
  title: string | null;
  excerpt: string | null;
  tagIds: string[];
  createdAt: Date;
  updatedAt: Date;
}): IdeaListItem {
  return {
    id: data.id,
    title: data.title,
    excerpt: data.excerpt,
    tagIds: data.tagIds,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/** CRUD handlers + saving/deleting/error flags for the ideas list. */
export function useIdeasMutations(
  setIdeas: Dispatch<SetStateAction<IdeaListItem[]>>,
  callbacks: DashboardCallbacks,
  onCreateSuccess: () => void,
  onDeleteSuccess: () => void,
) {
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateIdea = useCallback(
    async (data: { content: string; title?: string; tagIds?: string[] }) => {
      setIsSaving(true);
      setError(null);
      try {
        const result = await createIdea(data);
        if (result.success && result.data) {
          const newIdea = toListItem(result.data);
          setIdeas((prev) => [newIdea, ...prev]);
          callbacks.handleIdeaCreated(newIdea);
          onCreateSuccess();
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
    [setIdeas, callbacks, onCreateSuccess],
  );

  const handleUpdateIdea = useCallback(
    async (
      id: number,
      data: { content?: string; title?: string | null; tagIds?: string[] },
    ) => {
      setIsSaving(true);
      setError(null);
      try {
        const result = await updateIdea(id, data);
        if (result.success && result.data) {
          const updatedIdea = toListItem(result.data);
          setIdeas((prev) => prev.map((idea) => (idea.id === id ? updatedIdea : idea)));
          callbacks.handleIdeaUpdated(updatedIdea);
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
    [setIdeas, callbacks],
  );

  const handleDeleteIdea = useCallback(
    async (id: number) => {
      setIsDeleting(true);
      setError(null);
      try {
        const result = await deleteIdea(id);
        if (result.success) {
          setIdeas((prev) => prev.filter((idea) => idea.id !== id));
          callbacks.handleIdeaDeleted(id);
          onDeleteSuccess();
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
    [setIdeas, callbacks, onDeleteSuccess],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    isSaving,
    isDeleting,
    error,
    handleCreateIdea,
    handleUpdateIdea,
    handleDeleteIdea,
    clearError,
  };
}
