"use client";

import { useState, useCallback } from "react";
import {
  createFolder,
  updateFolder,
  deleteFolder,
} from "@/actions/folders";
import { useDashboardService } from "@/contexts/dashboard-service";

/** Return type of useFoldersViewModel — can be used as a prop type */
export type FoldersViewModel = ReturnType<typeof useFoldersViewModel>;

/**
 * Folders viewmodel — manages folder CRUD (server actions + service sync)
 * and local UI state (editing / creating).
 *
 * Must be used inside DashboardServiceProvider.
 */
export function useFoldersViewModel() {
  const {
    folders,
    handleFolderCreated,
    handleFolderDeleted,
    handleFolderUpdated,
  } = useDashboardService();

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateFolder = useCallback(
    async (name: string, icon: string) => {
      const result = await createFolder({ name, icon });
      if (result.success && result.data) {
        handleFolderCreated(result.data);
        setIsCreating(false);
      } else {
        alert(result.error || "Failed to create folder");
      }
    },
    [handleFolderCreated],
  );

  const handleUpdateFolder = useCallback(
    async (id: string, data: { name?: string; icon?: string }) => {
      const result = await updateFolder(id, data);
      if (result.success && result.data) {
        handleFolderUpdated(result.data);
        setEditingFolderId(null);
      } else {
        alert(result.error || "Failed to update folder");
      }
    },
    [handleFolderUpdated],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      if (!confirm("Are you sure you want to delete this folder?")) return;

      const result = await deleteFolder(id);
      if (result.success) {
        handleFolderDeleted(id);
      } else {
        alert(result.error || "Failed to delete folder");
      }
    },
    [handleFolderDeleted],
  );

  const startEditing = useCallback((id: string) => {
    setEditingFolderId(id);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingFolderId(null);
  }, []);

  return {
    folders,
    editingFolderId,
    isCreating,
    setIsCreating,
    handleCreateFolder,
    handleUpdateFolder,
    handleDeleteFolder,
    startEditing,
    cancelEditing,
  };
}
