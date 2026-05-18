"use client";

import { useState, useCallback } from "react";
import type { Link } from "@/models/types";
import { createLink } from "@/actions/links";

/** ViewModel for the create-link modal. */
export function useCreateLinkViewModel(
  siteUrl: string,
  onSuccess: (link: Link) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"simple" | "custom">("simple");
  const [url, setUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const addTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => new Set(prev).add(tagId));
  }, []);

  const removeTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      next.delete(tagId);
      return next;
    });
  }, []);

  const resetForm = useCallback(() => {
    setUrl("");
    setCustomSlug("");
    setFolderId(undefined);
    setNote("");
    setScreenshotUrl("");
    setSelectedTagIds(new Set());
    setIsOpen(false);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setIsLoading(true);

      const result = await createLink({
        originalUrl: url,
        customSlug: mode === "custom" ? customSlug : undefined,
        folderId,
        note: note.trim() || undefined,
        screenshotUrl: screenshotUrl.trim() || undefined,
        tagIds: selectedTagIds.size > 0 ? Array.from(selectedTagIds) : undefined,
      });

      setIsLoading(false);

      if (result.success && result.data) {
        onSuccess(result.data);
        resetForm();
      } else {
        setError(result.error || "Failed to create link");
      }
    },
    [url, mode, customSlug, folderId, note, screenshotUrl, selectedTagIds, onSuccess, resetForm],
  );

  return {
    isOpen, setIsOpen,
    mode, setMode,
    url, setUrl,
    customSlug, setCustomSlug,
    folderId, setFolderId,
    note, setNote,
    screenshotUrl, setScreenshotUrl,
    selectedTagIds, addTag, removeTag,
    isLoading,
    error,
    handleSubmit,
    siteUrl,
  };
}
