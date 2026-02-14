"use client";

import { createContext, useContext, useMemo } from "react";
import { useSearchParams } from "next/navigation";

interface FolderSelectionContextValue {
  /** null = all links, "uncategorized" = no folder, string = specific folder id */
  selectedFolderId: string | null;
}

const FolderSelectionContext = createContext<FolderSelectionContextValue>({
  selectedFolderId: null,
});

export function FolderSelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const selectedFolderId = searchParams.get("folder") ?? null;

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
