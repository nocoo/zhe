"use client";

import { createContext, useContext, useMemo } from "react";

interface FolderSelectionContextValue {
  /** null = all links, "uncategorized" = no folder, string = specific folder id */
  selectedFolderId: string | null;
}

const FolderSelectionContext = createContext<FolderSelectionContextValue>({
  selectedFolderId: null,
});

export function FolderSelectionProvider({
  selectedFolderId,
  children,
}: {
  selectedFolderId: string | null;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ selectedFolderId }),
    [selectedFolderId],
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
