"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { Link, Tag, LinkTag, AnalyticsStats } from "@/models/types";
import { createLink, deleteLink, updateLink, updateLinkNote, getAnalyticsStats, refreshLinkMetadata, batchRefreshLinkMetadata } from "@/actions/links";
import { copyToClipboard } from "@/lib/utils";
import { buildShortUrl } from "@/models/links";
import { isGitHubRepoUrl, GITHUB_REPO_PREVIEW_URL } from "@/models/links";
import type { ScreenshotSource } from "@/models/links";
import { buildFaviconUrl } from "@/models/settings";
import { fetchAndSaveScreenshot } from "@/actions/links";
import { useLinkMutations } from "@/viewmodels/useLinkMutations";
import type { LinkMutationCallbacks } from "@/viewmodels/useLinkMutations";
import { useRef } from "react";

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

  // Screenshot state — DB is the primary source
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(
    link.screenshotUrl ?? null
  );
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);

  // Sync local screenshot state when parent prop changes (e.g. after edit-save)
  useEffect(() => {
    setScreenshotUrl(link.screenshotUrl ?? null);
  }, [link.screenshotUrl]);

  const shortUrl = buildShortUrl(siteUrl, link.slug);

  // Display logic: GitHub repo pages use a fixed preview image;
  // otherwise show screenshotUrl from DB, else favicon.
  const isGitHubRepo = isGitHubRepoUrl(link.originalUrl);
  const displayScreenshotUrl = isGitHubRepo ? GITHUB_REPO_PREVIEW_URL : screenshotUrl;
  const faviconUrl = (isGitHubRepo || displayScreenshotUrl) ? null : buildFaviconUrl(link.originalUrl);

  // Track favicon load failure (e.g. 404) so the component can fall back to a placeholder icon
  const [faviconError, setFaviconError] = useState(false);
  // Reset error state when the favicon URL changes (e.g. after metadata refresh)
  useEffect(() => {
    setFaviconError(false);
  }, [link.metaFavicon]);

  const handleFaviconError = useCallback(() => {
    setFaviconError(true);
  }, []);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(shortUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shortUrl]);

  const [copiedOriginalUrl, setCopiedOriginalUrl] = useState(false);
  const handleCopyOriginalUrl = useCallback(async () => {
    const success = await copyToClipboard(link.originalUrl);
    if (success) {
      setCopiedOriginalUrl(true);
      setTimeout(() => setCopiedOriginalUrl(false), 2000);
    }
  }, [link.originalUrl]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    const result = await deleteLink(link.id);
    if (result.success) {
      onDelete(link.id);
    } else {
      toast.error("删除失败", { description: result.error || "Failed to delete link" });
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

  /** Fetch a preview screenshot from the selected source, persist to R2, and show toast */
  const handleFetchPreview = useCallback(async (source: ScreenshotSource) => {
    if (isFetchingPreview) return;
    setIsFetchingPreview(true);

    const sourceName = source === "microlink" ? "Microlink" : "Screenshot Domains";
    toast.info("正在抓取预览图...", { description: `来源: ${sourceName}` });

    try {
      // Single server action: fetch screenshot → download → upload to R2 → persist URL
      // This runs entirely on the server, avoiding CORS issues with screenshot.domains CDN.
      const result = await fetchAndSaveScreenshot(link.id, link.originalUrl, source);
      if (result.success && result.data) {
        setScreenshotUrl(result.data.screenshotUrl ?? null);
        onUpdate(result.data);
        toast.success("预览图已更新");
      } else {
        toast.error("抓取预览图失败", { description: result.error || "Unknown error" });
      }
    } catch (error) {
      console.error("Failed to fetch preview:", error);
      toast.error("抓取预览图出错", { description: "请稍后重试" });
    } finally {
      setIsFetchingPreview(false);
    }
  }, [link.id, link.originalUrl, isFetchingPreview, onUpdate]);

  const handleRefreshMetadata = useCallback(async () => {
    setIsRefreshingMetadata(true);
    try {
      const result = await refreshLinkMetadata(link.id);
      if (result.success && result.data) {
        onUpdate(result.data);
        toast.success("元数据已刷新");
      } else {
        toast.error("刷新元数据失败", { description: result.error || "Failed to refresh metadata" });
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
    copiedOriginalUrl,
    isDeleting,
    showAnalytics,
    analyticsStats,
    isLoadingAnalytics,
    handleCopy,
    handleCopyOriginalUrl,
    handleDelete,
    handleToggleAnalytics,
    handleRefreshMetadata,
    isRefreshingMetadata,
    screenshotUrl: displayScreenshotUrl,
    isFetchingPreview,
    handleFetchPreview,
    faviconUrl,
    faviconError,
    handleFaviconError,
  };
}

/** Determine whether a link needs auto-fetched metadata. */
function linkNeedsMetadata(link: Link): boolean {
  const hasMetadata = !!(link.metaTitle || link.metaDescription || link.metaFavicon);
  return !hasMetadata && !link.note;
}

/**
 * Hook that batch-refreshes metadata for all links that need it.
 *
 * Replaces the per-card `useEffect` that caused N+1 server action calls.
 * Should be called once at the list level (e.g. in `LinksList`).
 *
 * @param links      - The current list of links.
 * @param onUpdate   - Callback to update individual links in parent state.
 */
export function useAutoRefreshMetadata(
  links: Link[],
  onUpdate: (link: Link) => void,
) {
  // Track which batch we've already kicked off to avoid re-triggering
  const processedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    // Collect links that need metadata and haven't been processed yet
    const needsRefresh = links.filter(
      (link) => linkNeedsMetadata(link) && !processedRef.current.has(link.id),
    );

    if (needsRefresh.length === 0) return;

    // Mark as processed immediately to prevent duplicate calls
    const ids = needsRefresh.map((l) => l.id);
    for (const id of ids) {
      processedRef.current.add(id);
    }

    let cancelled = false;

    batchRefreshLinkMetadata(ids)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          for (const updatedLink of result.data) {
            onUpdate(updatedLink);
          }
        } else {
          // Batch failed — remove IDs so they can be retried on next render
          for (const id of ids) {
            processedRef.current.delete(id);
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Network/unexpected error — allow retry on next render
        for (const id of ids) {
          processedRef.current.delete(id);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [links, onUpdate]);
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

/** Callbacks for syncing edit mutations back to the parent service.
 *  Alias for the shared LinkMutationCallbacks interface.
 */
export type EditLinkCallbacks = LinkMutationCallbacks;

/** ViewModel for inline link editing — manages URL, folder, note, tags & save.
 *
 *  Used directly inside LinkCard when edit mode is active.
 *  Form fields are initialised from `link` and re-synced when the link prop changes.
 */
export function useInlineLinkEditViewModel(
  link: Link,
  allTags: Tag[],
  allLinkTags: LinkTag[],
  callbacks: EditLinkCallbacks,
) {
  // Form fields — initialised from the link
  const [editUrl, setEditUrl] = useState(link.originalUrl);
  const [editSlug, setEditSlug] = useState(link.slug);
  const [editFolderId, setEditFolderId] = useState<string | undefined>(link.folderId ?? undefined);
  const [editNote, setEditNote] = useState(link.note ?? "");
  const [editScreenshotUrl, setEditScreenshotUrl] = useState(link.screenshotUrl ?? "");

  // Re-sync form fields when the underlying link data changes (e.g. after metadata refresh)
  useEffect(() => {
    setEditUrl(link.originalUrl);
    setEditSlug(link.slug);
    setEditFolderId(link.folderId ?? undefined);
    setEditNote(link.note ?? "");
    setEditScreenshotUrl(link.screenshotUrl ?? "");
  }, [link.id, link.originalUrl, link.slug, link.folderId, link.note, link.screenshotUrl]);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Tag helpers — delegated to shared useLinkMutations hook ──
  const mutations = useLinkMutations(allTags, allLinkTags, callbacks);

  // Tags assigned to this link (derived from shared hook)
  const assignedTagIds = useMemo(() => {
    return mutations.getAssignedTagIds(link.id);
  }, [link.id, mutations]);

  const assignedTags = useMemo(
    () => allTags.filter((t) => assignedTagIds.has(t.id)),
    [allTags, assignedTagIds],
  );

  // Save URL + folder + slug + note + screenshotUrl
  const saveEdit = useCallback(async () => {
    setIsSaving(true);
    setError("");

    try {
      // Build update payload — include slug only if changed
      const payload: { originalUrl: string; folderId?: string; slug?: string; screenshotUrl?: string | null } = {
        originalUrl: editUrl,
        folderId: editFolderId,
      };
      if (editSlug !== link.slug) {
        payload.slug = editSlug;
      }
      // Include screenshotUrl only if changed
      const currentScreenshotUrl = link.screenshotUrl ?? "";
      if (editScreenshotUrl !== currentScreenshotUrl) {
        payload.screenshotUrl = editScreenshotUrl.trim() || null;
      }

      // Update link (URL + folder + optional slug)
      const linkResult = await updateLink(link.id, payload);

      if (!linkResult.success || !linkResult.data) {
        setError(linkResult.error || "Failed to update link");
        setIsSaving(false);
        return true; // indicates save attempted (for caller to decide on edit mode)
      }

      // Update note (only if changed)
      const currentNote = link.note ?? "";
      let noteSaved = true;
      if (editNote !== currentNote) {
        const noteResult = await updateLinkNote(
          link.id,
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
        note: noteSaved ? (editNote.trim() || null) : (link.note ?? null),
        screenshotUrl: editScreenshotUrl.trim() || null,
      };
      callbacks.onLinkUpdated(updatedLink);

      // Show note error so the list still updates
      if (!noteSaved) {
        setError("Link saved but note update failed");
      }

      return true; // save succeeded
    } catch {
      setError("An unexpected error occurred");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [link, editUrl, editSlug, editFolderId, editNote, editScreenshotUrl, callbacks]);

  // Tag operations — thin wrappers that bind link.id to the shared hook.
  const addTag = useCallback(
    async (tagId: string) => {
      await mutations.addTag(link.id, tagId);
    },
    [link.id, mutations],
  );

  const removeTag = useCallback(
    async (tagId: string) => {
      await mutations.removeTag(link.id, tagId);
    },
    [link.id, mutations],
  );

  const createAndAssignTag = useCallback(
    async (name: string) => {
      return mutations.createAndAssignTag(link.id, name);
    },
    [link.id, mutations],
  );

  return {
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
    saveEdit,
    addTag,
    removeTag,
    createAndAssignTag,
  };
}
