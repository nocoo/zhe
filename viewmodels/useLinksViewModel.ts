"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { Link, Tag, LinkTag, AnalyticsStats } from "@/models/types";
import { createLink, deleteLink, updateLink, updateLinkNote, getAnalyticsStats, refreshLinkMetadata } from "@/actions/links";
import { createTag, addTagToLink, removeTagFromLink } from "@/actions/tags";
import { copyToClipboard } from "@/lib/utils";
import { buildShortUrl, fetchMicrolinkScreenshot } from "@/models/links";
import { saveScreenshot } from "@/actions/links";

/** ViewModel for a single link card — manages copy, delete, analytics, metadata & screenshot */
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

  // Metadata refresh state
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);

  // Screenshot state — DB is the primary source; Microlink is fallback
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(
    link.screenshotUrl ?? null
  );
  const [isLoadingScreenshot, setIsLoadingScreenshot] = useState(false);

  const shortUrl = buildShortUrl(siteUrl, link.slug);

  // Fetch screenshot from Microlink if not persisted in DB yet
  useEffect(() => {
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
  }, [link.id, link.originalUrl, screenshotUrl]);

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
  link: Link | null,
  allTags: Tag[],
  allLinkTags: LinkTag[],
  callbacks: EditLinkCallbacks,
) {
  // Dialog open/close
  const [isOpen, setIsOpen] = useState(false);

  // Form fields
  const [editUrl, setEditUrl] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editFolderId, setEditFolderId] = useState<string | undefined>(undefined);
  const [editNote, setEditNote] = useState("");

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // Tags assigned to this link
  const assignedTagIds = useMemo(() => {
    if (!link) return new Set<string>();
    return new Set(
      allLinkTags.filter((lt) => lt.linkId === link.id).map((lt) => lt.tagId),
    );
  }, [link, allLinkTags]);

  const assignedTags = useMemo(
    () => allTags.filter((t) => assignedTagIds.has(t.id)),
    [allTags, assignedTagIds],
  );

  // Open dialog and populate form with current link data
  const openDialog = useCallback(
    (targetLink: Link) => {
      setEditUrl(targetLink.originalUrl);
      setEditSlug(targetLink.slug);
      setEditFolderId(targetLink.folderId ?? undefined);
      setEditNote(targetLink.note ?? "");
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
    if (!link) return;
    setIsSaving(true);
    setError("");

    try {
      // Build update payload — include slug only if changed
      const payload: { originalUrl: string; folderId?: string; slug?: string } = {
        originalUrl: editUrl,
        folderId: editFolderId,
      };
      if (editSlug !== link.slug) {
        payload.slug = editSlug;
      }

      // Update link (URL + folder + optional slug)
      const linkResult = await updateLink(link.id, payload);

      if (!linkResult.success || !linkResult.data) {
        setError(linkResult.error || "Failed to update link");
        setIsSaving(false);
        return;
      }

      // Update note (only if changed)
      const currentNote = link.note ?? "";
      if (editNote !== currentNote) {
        const noteResult = await updateLinkNote(
          link.id,
          editNote.trim() || null,
        );
        if (!noteResult.success) {
          setError(noteResult.error || "Failed to update note");
          setIsSaving(false);
          return;
        }
      }

      // Merge note into the updated link for the callback
      const updatedLink: Link = {
        ...linkResult.data,
        note: editNote.trim() || null,
      };
      callbacks.onLinkUpdated(updatedLink);
      setIsOpen(false);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  }, [link, editUrl, editSlug, editFolderId, editNote, callbacks]);

  // Tag operations — immediate (optimistic)
  const addTag = useCallback(
    async (tagId: string) => {
      if (!link) return;
      callbacks.onLinkTagAdded({ linkId: link.id, tagId });
      const result = await addTagToLink(link.id, tagId);
      if (!result.success) {
        // Rollback on failure
        callbacks.onLinkTagRemoved(link.id, tagId);
      }
    },
    [link, callbacks],
  );

  const removeTag = useCallback(
    async (tagId: string) => {
      if (!link) return;
      callbacks.onLinkTagRemoved(link.id, tagId);
      const result = await removeTagFromLink(link.id, tagId);
      if (!result.success) {
        // Rollback on failure
        callbacks.onLinkTagAdded({ linkId: link.id, tagId });
      }
    },
    [link, callbacks],
  );

  // Create a new tag and immediately assign it to the link
  const createAndAssignTag = useCallback(
    async (name: string) => {
      if (!link) return;
      const result = await createTag({ name });
      if (result.success && result.data) {
        callbacks.onTagCreated(result.data);
        // Assign to current link
        await addTag(result.data.id);
      }
      return result;
    },
    [link, callbacks, addTag],
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
