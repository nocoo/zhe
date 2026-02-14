"use client";

import { createContext, useContext, useMemo } from "react";
import type { Folder } from "@/models/types";

interface FolderSelectionContextValue {
  /** null = all links, "uncategorized" = no folder, string = specific folder id */
  selectedFolderId: string | null;
  /** Live folder list from the folders viewmodel */
  folders: Folder[];
}

const FolderSelectionContext = createContext<FolderSelectionContextValue>({
  selectedFolderId: null,
  folders: [],
});

export function FolderSelectionProvider({
  selectedFolderId,
  folders,
  children,
}: {
  selectedFolderId: string | null;
  folders: Folder[];
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ selectedFolderId, folders }),
    [selectedFolderId, folders],
  );

  return (
    <FolderSelectionContext.Provider value={value}>
      {children}
    </FolderSelectionContext.Provider>
  );
}

export function useFolderSelection() {
  return useContext(FolderSelectionContext);
}
