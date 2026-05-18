"use client";

import { useEffect } from "react";

/**
 * Bind Cmd/Ctrl+S to save (when dirty + not already saving) plus a
 * beforeunload warning when there are unsaved changes.
 */
export function useEditorShortcuts({
  dirty,
  isSaving,
  onSave,
}: {
  dirty: boolean;
  isSaving: boolean;
  onSave: () => void;
}) {
  // Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !isSaving) onSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, isSaving, onSave]);

  // beforeunload warning when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
