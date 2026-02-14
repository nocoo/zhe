"use client";

import { useState, useCallback } from "react";
import type { Link, AnalyticsStats } from "@/models/types";
import { createLink, deleteLink, updateLink, getAnalyticsStats } from "@/actions/links";
import { copyToClipboard } from "@/lib/utils";
import { buildShortUrl } from "@/models/links";

/** ViewModel for the links list page — manages link CRUD and analytics state */
export function useLinksViewModel(initialLinks: Link[], siteUrl: string) {
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [isCreating, setIsCreating] = useState(false);

  const handleLinkCreated = useCallback((newLink: Link) => {
    setLinks((prev) => [newLink, ...prev]);
  }, []);

  const handleLinkDeleted = useCallback((linkId: number) => {
    setLinks((prev) => prev.filter((link) => link.id !== linkId));
  }, []);

  const handleLinkUpdated = useCallback((updatedLink: Link) => {
    setLinks((prev) =>
      prev.map((link) => (link.id === updatedLink.id ? updatedLink : link)),
    );
  }, []);

  return {
    links,
    isCreating,
    setIsCreating,
    handleLinkCreated,
    handleLinkDeleted,
    handleLinkUpdated,
    siteUrl,
  };
}

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

  const shortUrl = buildShortUrl(siteUrl, link.slug);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(shortUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shortUrl]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Are you sure you want to delete this link?")) return;
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
