"use client";

import { createContext, useContext } from "react";

interface FolderSelectionContextValue {
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
  return (
    <FolderSelectionContext.Provider value={{ selectedFolderId }}>
      {children}
    </FolderSelectionContext.Provider>
  );
}

export function useFolderSelection() {
  return useContext(FolderSelectionContext);
}
