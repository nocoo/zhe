"use client";

import { useState, useCallback, useEffect } from "react";
import type { Folder } from "@/models/types";
import {
  createFolder,
  updateFolder,
  deleteFolder,
} from "@/actions/folders";

/** Read the `folder` query param from the current URL (client-side only). */
function getFolderFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("folder") ?? null;
}

/** Return type of useFoldersViewModel — can be used as a prop type */
export type FoldersViewModel = ReturnType<typeof useFoldersViewModel>;
export function useFoldersViewModel(initialFolders: Folder[]) {
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Initialize from URL, then keep in sync via local state for immediate UI
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    () => getFolderFromUrl(),
  );

  // Sync local state when user navigates with browser back/forward
  useEffect(() => {
    function onPopState() {
      setSelectedFolderId(getFolderFromUrl());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const selectFolder = useCallback(
    (folderId: string | null) => {
      // Update local state immediately for instant UI feedback
      setSelectedFolderId(folderId);
      // Sync URL without triggering RSC re-render
      const url = folderId === null ? "/dashboard" : `/dashboard?folder=${folderId}`;
      window.history.replaceState(null, "", url);
    },
    [],
  );

  const handleCreateFolder = useCallback(
    async (name: string, icon: string) => {
      const result = await createFolder({ name, icon });
      if (result.success && result.data) {
        setFolders((prev) => [...prev, result.data!]);
        setIsCreating(false);
      } else {
        alert(result.error || "Failed to create folder");
      }
    },
    [],
  );

  const handleUpdateFolder = useCallback(
    async (id: string, data: { name?: string; icon?: string }) => {
      const result = await updateFolder(id, data);
      if (result.success && result.data) {
        setFolders((prev) =>
          prev.map((f) => (f.id === id ? result.data! : f)),
        );
        setEditingFolderId(null);
      } else {
        alert(result.error || "Failed to update folder");
      }
    },
    [],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      if (!confirm("Are you sure you want to delete this folder?")) return;

      const result = await deleteFolder(id);
      if (result.success) {
        setFolders((prev) => prev.filter((f) => f.id !== id));
        // If the deleted folder was selected, navigate to "全部链接"
        setSelectedFolderId((prev) => {
          if (prev === id) {
            window.history.replaceState(null, "", "/dashboard");
            return null;
          }
          return prev;
        });
      } else {
        alert(result.error || "Failed to delete folder");
      }
    },
    [],
  );

  const startEditing = useCallback((id: string) => {
    setEditingFolderId(id);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingFolderId(null);
  }, []);

  return {
    folders,
    selectedFolderId,
    editingFolderId,
    isCreating,
    setIsCreating,
    selectFolder,
    handleCreateFolder,
    handleUpdateFolder,
    handleDeleteFolder,
    startEditing,
    cancelEditing,
  };
}
