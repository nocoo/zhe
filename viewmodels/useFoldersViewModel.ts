"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Folder } from "@/models/types";
import {
  createFolder,
  updateFolder,
  deleteFolder,
} from "@/actions/folders";

/** Return type of useFoldersViewModel — can be used as a prop type */
export type FoldersViewModel = ReturnType<typeof useFoldersViewModel>;
export function useFoldersViewModel(initialFolders: Folder[]) {
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // URL is the single source of truth for folder selection
  const selectedFolderId = searchParams.get("folder") ?? null;

  const selectFolder = useCallback(
    (folderId: string | null) => {
      if (folderId === null) {
        // "全部链接" — remove folder param
        router.replace("/dashboard");
      } else {
        router.replace(`/dashboard?folder=${folderId}`);
      }
    },
    [router],
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
        if (selectedFolderId === id) {
          router.replace("/dashboard");
        }
      } else {
        alert(result.error || "Failed to delete folder");
      }
    },
    [selectedFolderId, router],
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
