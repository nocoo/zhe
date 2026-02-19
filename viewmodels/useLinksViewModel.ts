"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { Link, Tag, LinkTag, AnalyticsStats } from "@/models/types";
import type { PreviewStyle } from "@/models/settings";
import { createLink, deleteLink, updateLink, updateLinkNote, getAnalyticsStats, refreshLinkMetadata } from "@/actions/links";
import { createTag, addTagToLink, removeTagFromLink } from "@/actions/tags";
import { copyToClipboard } from "@/lib/utils";
import { buildShortUrl, fetchMicrolinkScreenshot } from "@/models/links";
import { buildFaviconUrl } from "@/models/settings";
import { saveScreenshot } from "@/actions/links";

/** ViewModel for a single link card — manages copy, delete, analytics, metadata & screenshot */
export function useLinkCardViewModel(
  link: Link,
  siteUrl: string,
  onDelete: (id: number) => void,
  onUpdate: (link: Link) => void,
  previewStyle: PreviewStyle = "favicon",
) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsStats, setAnalyticsStats] = useState<AnalyticsStats | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Metadata refresh state
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);

  // Screenshot state — DB is the primary source; Microlink is fallback
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(
    link.screenshotUrl ?? null
  );
  const [isLoadingScreenshot, setIsLoadingScreenshot] = useState(false);

  // Sync local screenshot state when parent prop changes (e.g. after edit-save)
  useEffect(() => {
    setScreenshotUrl(link.screenshotUrl ?? null);
  }, [link.screenshotUrl]);

  const shortUrl = buildShortUrl(siteUrl, link.slug);

  // Auto-fetch text metadata (title/description/favicon) if all missing.
  // Skip if user already wrote a note — they have their own description intent.
  const hasMetadata = !!(link.metaTitle || link.metaDescription || link.metaFavicon);
  const skipAutoFetch = hasMetadata || !!link.note;
  useEffect(() => {
    if (skipAutoFetch) return;
    let cancelled = false;
    setIsRefreshingMetadata(true);
    refreshLinkMetadata(link.id).then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        onUpdate(result.data);
      }
      setIsRefreshingMetadata(false);
    });
    return () => { cancelled = true; };
  }, [link.id, skipAutoFetch, onUpdate]);

  // Compute favicon URL: DB screenshotUrl takes absolute priority over previewStyle
  const faviconUrl = screenshotUrl ? null
    : previewStyle === "favicon" ? buildFaviconUrl(link.originalUrl)
    : null;

  // Fetch screenshot from Microlink if not persisted in DB yet (screenshot mode only)
  useEffect(() => {
    if (previewStyle === "favicon") return;
    if (screenshotUrl) return;
    let cancelled = false;
    setIsLoadingScreenshot(true);
    fetchMicrolinkScreenshot(link.originalUrl).then((url) => {
      if (cancelled) return;
      setScreenshotUrl(url);
      setIsLoadingScreenshot(false);
      // Persist to DB so we never call Microlink again for this link
      if (url) {
        void saveScreenshot(link.id, url);
      }
    });
    return () => { cancelled = true; };
  }, [link.id, link.originalUrl, screenshotUrl, previewStyle]);

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

  const handleRetryScreenshot = useCallback(async () => {
    if (isLoadingScreenshot) return;
    setIsLoadingScreenshot(true);
    const url = await fetchMicrolinkScreenshot(link.originalUrl);
    setScreenshotUrl(url);
    setIsLoadingScreenshot(false);
    if (url) {
      void saveScreenshot(link.id, url);
    }
  }, [link.id, link.originalUrl, isLoadingScreenshot]);

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
    handleCopy,
    handleDelete,
    handleToggleAnalytics,
    handleRefreshMetadata,
    isRefreshingMetadata,
    screenshotUrl,
    isLoadingScreenshot,
    handleRetryScreenshot,
    faviconUrl,
    previewStyle,
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

/** Callbacks for syncing edit-dialog mutations back to the parent service */
export interface EditLinkCallbacks {
  onLinkUpdated: (link: Link) => void;
  onTagCreated: (tag: Tag) => void;
  onLinkTagAdded: (linkTag: LinkTag) => void;
  onLinkTagRemoved: (linkId: number, tagId: string) => void;
}

/** ViewModel for the edit-link dialog — manages URL, folder, note & tags */
export function useEditLinkViewModel(
  initialLink: Link | null,
  allTags: Tag[],
  allLinkTags: LinkTag[],
  callbacks: EditLinkCallbacks,
) {
  // Dialog open/close
  const [isOpen, setIsOpen] = useState(false);

  // Currently-edited link — set when openDialog is called
  const [editingLink, setEditingLink] = useState<Link | null>(initialLink);

  // Form fields
  const [editUrl, setEditUrl] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editFolderId, setEditFolderId] = useState<string | undefined>(undefined);
  const [editNote, setEditNote] = useState("");
  const [editScreenshotUrl, setEditScreenshotUrl] = useState("");

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // Tags assigned to the currently-edited link
  const assignedTagIds = useMemo(() => {
    if (!editingLink) return new Set<string>();
    return new Set(
      allLinkTags.filter((lt) => lt.linkId === editingLink.id).map((lt) => lt.tagId),
    );
  }, [editingLink, allLinkTags]);

  const assignedTags = useMemo(
    () => allTags.filter((t) => assignedTagIds.has(t.id)),
    [allTags, assignedTagIds],
  );

  // Open dialog and populate form with current link data
  const openDialog = useCallback(
    (targetLink: Link) => {
      setEditingLink(targetLink);
      setEditUrl(targetLink.originalUrl);
      setEditSlug(targetLink.slug);
      setEditFolderId(targetLink.folderId ?? undefined);
      setEditNote(targetLink.note ?? "");
      setEditScreenshotUrl(targetLink.screenshotUrl ?? "");
      setError("");
      setIsOpen(true);
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setError("");
  }, []);

  // Save URL + folder + slug + note
  const saveEdit = useCallback(async () => {
    if (!editingLink) return;
    setIsSaving(true);
    setError("");

    try {
      // Build update payload — include slug only if changed
      const payload: { originalUrl: string; folderId?: string; slug?: string; screenshotUrl?: string | null } = {
        originalUrl: editUrl,
        folderId: editFolderId,
      };
      if (editSlug !== editingLink.slug) {
        payload.slug = editSlug;
      }
      // Include screenshotUrl only if changed
      const currentScreenshotUrl = editingLink.screenshotUrl ?? "";
      if (editScreenshotUrl !== currentScreenshotUrl) {
        payload.screenshotUrl = editScreenshotUrl.trim() || null;
      }

      // Update link (URL + folder + optional slug)
      const linkResult = await updateLink(editingLink.id, payload);

      if (!linkResult.success || !linkResult.data) {
        setError(linkResult.error || "Failed to update link");
        setIsSaving(false);
        return;
      }

      // Update note (only if changed)
      const currentNote = editingLink.note ?? "";
      let noteSaved = true;
      if (editNote !== currentNote) {
        const noteResult = await updateLinkNote(
          editingLink.id,
          editNote.trim() || null,
        );
        if (!noteResult.success) {
          noteSaved = false;
        }
      }

      // Always sync updated link back to the list — even if note failed,
      // the primary link update already succeeded on the server.
      const updatedLink: Link = {
        ...linkResult.data,
        note: noteSaved ? (editNote.trim() || null) : (editingLink.note ?? null),
        screenshotUrl: editScreenshotUrl.trim() || null,
      };
      callbacks.onLinkUpdated(updatedLink);
      setIsOpen(false);

      // Show note error after closing dialog so the list still updates
      if (!noteSaved) {
        setError("Link saved but note update failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  }, [editingLink, editUrl, editSlug, editFolderId, editNote, editScreenshotUrl, callbacks]);

  // Tag operations — immediate (optimistic)
  const addTag = useCallback(
    async (tagId: string) => {
      if (!editingLink) return;
      callbacks.onLinkTagAdded({ linkId: editingLink.id, tagId });
      const result = await addTagToLink(editingLink.id, tagId);
      if (!result.success) {
        // Rollback on failure
        callbacks.onLinkTagRemoved(editingLink.id, tagId);
      }
    },
    [editingLink, callbacks],
  );

  const removeTag = useCallback(
    async (tagId: string) => {
      if (!editingLink) return;
      callbacks.onLinkTagRemoved(editingLink.id, tagId);
      const result = await removeTagFromLink(editingLink.id, tagId);
      if (!result.success) {
        // Rollback on failure
        callbacks.onLinkTagAdded({ linkId: editingLink.id, tagId });
      }
    },
    [editingLink, callbacks],
  );

  // Create a new tag and immediately assign it to the link
  const createAndAssignTag = useCallback(
    async (name: string) => {
      if (!editingLink) return;
      const result = await createTag({ name });
      if (result.success && result.data) {
        callbacks.onTagCreated(result.data);
        // Assign to current link
        await addTag(result.data.id);
      }
      return result;
    },
    [editingLink, callbacks, addTag],
  );

  return {
    isOpen,
    editUrl,
    setEditUrl,
    editSlug,
    setEditSlug,
    editFolderId,
    setEditFolderId,
    editNote,
    setEditNote,
    editScreenshotUrl,
    setEditScreenshotUrl,
    isSaving,
    error,
    assignedTagIds,
    assignedTags,
    openDialog,
    closeDialog,
    saveEdit,
    addTag,
    removeTag,
    createAndAssignTag,
  };
}
