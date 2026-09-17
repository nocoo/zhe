"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SearchCommandDialog } from "@/components/search-command-dialog";

const SearchContext = createContext<() => void>(() => {});
export const useOpenSearch = () => useContext(SearchContext);
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.isComposing
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <SearchContext.Provider value={openSearch}>
      {children}
      <SearchCommandDialog open={open} onOpenChange={setOpen} />
    </SearchContext.Provider>
  );
}
