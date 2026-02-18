"use client";

import { useState, useCallback, useEffect } from "react";
import type { Link, AnalyticsStats } from "@/models/types";
import { createLink, deleteLink, updateLink, getAnalyticsStats, refreshLinkMetadata } from "@/actions/links";
import { copyToClipboard } from "@/lib/utils";
import { buildShortUrl, fetchScreenshotUrl, getCachedScreenshot } from "@/models/links";

/** ViewModel for a single link card — manages copy, delete, edit, analytics */
export function useLinkCardViewModel(
  link: Link,
  siteUrl: string,
  onDelete: (id: number) => void,
  onUpdate: (link: Link) => void,
) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsStats, setAnalyticsStats] = useState<AnalyticsStats | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editUrl, setEditUrl] = useState("");
  const [editFolderId, setEditFolderId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  // Metadata refresh state
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);

  // Screenshot state
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(() =>
    getCachedScreenshot(link.originalUrl)
  );
  const [isLoadingScreenshot, setIsLoadingScreenshot] = useState(false);

  const shortUrl = buildShortUrl(siteUrl, link.slug);

  // Fetch screenshot on mount if not cached
  useEffect(() => {
    if (screenshotUrl) return;
    let cancelled = false;
    setIsLoadingScreenshot(true);
    fetchScreenshotUrl(link.originalUrl).then((url) => {
      if (!cancelled) {
        setScreenshotUrl(url);
        setIsLoadingScreenshot(false);
      }
    });
    return () => { cancelled = true; };
  }, [link.originalUrl, screenshotUrl]);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(shortUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shortUrl]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    const result = await deleteLink(link.id);
    if (result.success) {
      onDelete(link.id);
    } else {
      alert(result.error || "Failed to delete link");
    }
    setIsDeleting(false);
  }, [link.id, onDelete]);

  const handleToggleAnalytics = useCallback(async () => {
    const newShowState = !showAnalytics;
    setShowAnalytics(newShowState);

    if (newShowState && !analyticsStats && !isLoadingAnalytics) {
      setIsLoadingAnalytics(true);
      try {
        const result = await getAnalyticsStats(link.id);
        if (result.success && result.data) {
          setAnalyticsStats(result.data);
        }
      } catch (error) {
        console.error("Failed to load analytics:", error);
      } finally {
        setIsLoadingAnalytics(false);
      }
    }
  }, [showAnalytics, analyticsStats, isLoadingAnalytics, link.id]);

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setEditUrl(link.originalUrl);
    setEditFolderId(link.folderId ?? undefined);
  }, [link.originalUrl, link.folderId]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditUrl("");
    setEditFolderId(undefined);
  }, []);

  const saveEdit = useCallback(async () => {
    setIsSaving(true);
    const result = await updateLink(link.id, {
      originalUrl: editUrl,
      folderId: editFolderId,
    });
    setIsSaving(false);

    if (result.success && result.data) {
      onUpdate(result.data);
      setIsEditing(false);
      setEditUrl("");
      setEditFolderId(undefined);
    } else {
      alert(result.error || "Failed to update link");
    }
  }, [link.id, editUrl, editFolderId, onUpdate]);

  const handleRefreshMetadata = useCallback(async () => {
    setIsRefreshingMetadata(true);
    try {
      const result = await refreshLinkMetadata(link.id);
      if (result.success && result.data) {
        onUpdate(result.data);
      } else {
        alert(result.error || "Failed to refresh metadata");
      }
    } catch (error) {
      console.error("Failed to refresh metadata:", error);
    } finally {
      setIsRefreshingMetadata(false);
    }
  }, [link.id, onUpdate]);

  return {
    shortUrl,
    copied,
    isDeleting,
    showAnalytics,
    analyticsStats,
    isLoadingAnalytics,
    isEditing,
    editUrl,
    setEditUrl,
    editFolderId,
    setEditFolderId,
    isSaving,
    handleCopy,
    handleDelete,
    handleToggleAnalytics,
    startEditing,
    cancelEditing,
    saveEdit,
    handleRefreshMetadata,
    isRefreshingMetadata,
    screenshotUrl,
    isLoadingScreenshot,
  };
}

/** ViewModel for the create-link modal */
export function useCreateLinkViewModel(
  siteUrl: string,
  onSuccess: (link: Link) => void
) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"simple" | "custom">("simple");
  const [url, setUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setIsLoading(true);

      const result = await createLink({
        originalUrl: url,
        customSlug: mode === "custom" ? customSlug : undefined,
        folderId,
      });

      setIsLoading(false);

      if (result.success && result.data) {
        onSuccess(result.data);
        setUrl("");
        setCustomSlug("");
        setFolderId(undefined);
        setIsOpen(false);
      } else {
        setError(result.error || "Failed to create link");
      }
    },
    [url, mode, customSlug, folderId, onSuccess]
  );

  return {
    isOpen,
    setIsOpen,
    mode,
    setMode,
    url,
    setUrl,
    customSlug,
    setCustomSlug,
    folderId,
    setFolderId,
    isLoading,
    error,
    handleSubmit,
    siteUrl,
  };
}
