"use client";

import { useState, useCallback } from "react";
import type { Folder } from "@/models/types";
import {
  createFolder,
  updateFolder,
  deleteFolder,
} from "@/actions/folders";

/** ViewModel for the folders sidebar — manages folder CRUD, selection, and editing state */
export function useFoldersViewModel(initialFolders: Folder[]) {
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const selectFolder = useCallback(
    (folderId: string | null) => {
      setSelectedFolderId((prev) => (prev === folderId ? null : folderId));
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
        setSelectedFolderId((prev) => (prev === id ? null : prev));
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
