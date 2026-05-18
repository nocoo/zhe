"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { Link, AnalyticsStats } from "@/models/types";
import {
  deleteLink,
  getAnalyticsStats,
} from "@/actions/links";
import { refreshLinkMetadata } from "@/actions/links/metadata";
import { fetchAndSaveScreenshot } from "@/actions/links/screenshot";
import { copyToClipboard } from "@/lib/utils";
import {
  buildShortUrl,
  isGitHubRepoUrl,
  GITHUB_REPO_PREVIEW_URL,
  type ScreenshotSource,
} from "@/models/links";
import { buildFaviconUrl } from "@/models/settings";

/** Track clipboard copy state with auto-reset. */
function useCopyState(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);
  return { copied, copy };
}

/** Lazy-load analytics stats when the user toggles the panel open. */
function useLinkAnalyticsToggle(linkId: number) {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsStats, setAnalyticsStats] = useState<AnalyticsStats | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  const handleToggleAnalytics = useCallback(async () => {
    const newShowState = !showAnalytics;
    setShowAnalytics(newShowState);
    if (newShowState && !analyticsStats && !isLoadingAnalytics) {
      setIsLoadingAnalytics(true);
      try {
        const result = await getAnalyticsStats(linkId);
        if (result.success && result.data) setAnalyticsStats(result.data);
      } catch (error) {
        console.error("Failed to load analytics:", error);
      } finally {
        setIsLoadingAnalytics(false);
      }
    }
  }, [showAnalytics, analyticsStats, isLoadingAnalytics, linkId]);

  return { showAnalytics, analyticsStats, isLoadingAnalytics, handleToggleAnalytics };
}

/** Screenshot state — DB is primary source; supports manual refresh from a chosen source. */
function useScreenshotPreview(link: Link, onUpdate: (link: Link) => void) {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(
    link.screenshotUrl ?? null,
  );
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);

  useEffect(() => {
    setScreenshotUrl(link.screenshotUrl ?? null);
  }, [link.screenshotUrl]);

  const handleFetchPreview = useCallback(
    async (source: ScreenshotSource) => {
      if (isFetchingPreview) return;
      setIsFetchingPreview(true);
      const sourceName = source === "microlink" ? "Microlink" : "Screenshot Domains";
      toast.info("正在抓取预览图...", { description: `来源: ${sourceName}` });

      try {
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
    },
    [link.id, link.originalUrl, isFetchingPreview, onUpdate],
  );

  return { screenshotUrl, isFetchingPreview, handleFetchPreview };
}

/** Metadata-refresh state for a single link. */
function useMetadataRefresh(linkId: number, onUpdate: (link: Link) => void) {
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);

  const handleRefreshMetadata = useCallback(async () => {
    setIsRefreshingMetadata(true);
    try {
      const result = await refreshLinkMetadata(linkId);
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
  }, [linkId, onUpdate]);

  return { isRefreshingMetadata, handleRefreshMetadata };
}

/** Favicon load-failure tracking with reset on URL change. */
function useFaviconState(metaFavicon: string | null | undefined) {
  const [faviconError, setFaviconError] = useState(false);
  useEffect(() => { setFaviconError(false); }, [metaFavicon]);
  const handleFaviconError = useCallback(() => { setFaviconError(true); }, []);
  return { faviconError, handleFaviconError };
}

/**
 * ViewModel for a single link card — composes smaller hooks for analytics,
 * preview screenshots, metadata refresh, favicon, copy, and delete.
 */
export function useLinkCardViewModel(
  link: Link,
  siteUrl: string,
  onDelete: (id: number) => void,
  onUpdate: (link: Link) => void,
) {
  const shortUrl = buildShortUrl(siteUrl, link.slug);
  const { copied, copy: handleCopy } = useCopyState(shortUrl);
  const { copied: copiedOriginalUrl, copy: handleCopyOriginalUrl } = useCopyState(link.originalUrl);

  const analytics = useLinkAnalyticsToggle(link.id);
  const preview = useScreenshotPreview(link, onUpdate);
  const metadata = useMetadataRefresh(link.id, onUpdate);
  const favicon = useFaviconState(link.metaFavicon);

  // Display logic: GitHub repos use a fixed preview image; otherwise show
  // screenshotUrl from DB, else favicon.
  const isGitHubRepo = isGitHubRepoUrl(link.originalUrl);
  const displayScreenshotUrl = isGitHubRepo ? GITHUB_REPO_PREVIEW_URL : preview.screenshotUrl;
  const faviconUrl =
    isGitHubRepo || displayScreenshotUrl ? null : buildFaviconUrl(link.originalUrl);

  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    const result = await deleteLink(link.id);
    if (result.success) onDelete(link.id);
    else toast.error("删除失败", { description: result.error || "Failed to delete link" });
    setIsDeleting(false);
  }, [link.id, onDelete]);

  return {
    shortUrl,
    copied,
    copiedOriginalUrl,
    isDeleting,
    showAnalytics: analytics.showAnalytics,
    analyticsStats: analytics.analyticsStats,
    isLoadingAnalytics: analytics.isLoadingAnalytics,
    handleCopy,
    handleCopyOriginalUrl,
    handleDelete,
    handleToggleAnalytics: analytics.handleToggleAnalytics,
    handleRefreshMetadata: metadata.handleRefreshMetadata,
    isRefreshingMetadata: metadata.isRefreshingMetadata,
    screenshotUrl: displayScreenshotUrl,
    isFetchingPreview: preview.isFetchingPreview,
    handleFetchPreview: preview.handleFetchPreview,
    faviconUrl,
    faviconError: favicon.faviconError,
    handleFaviconError: favicon.handleFaviconError,
  };
}
