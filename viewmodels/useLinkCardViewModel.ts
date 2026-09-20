"use client";

import { toast } from "@nocoo/basalt/components/toast";
import { useCallback, useEffect, useState } from "react";
import { deleteLink, getAnalyticsStats, setLinkHidden } from "@/actions/links";
import { refreshLinkMetadata } from "@/actions/links/metadata";
import { deleteScreenshot } from "@/actions/links/screenshot";
import { getSpecialSource } from "@/cli/src/connector/sources";
import { copyToClipboard } from "@/lib/utils";
import { buildShortUrl, GITHUB_REPO_PREVIEW_URL, isGitHubRepoUrl } from "@/models/links";
import { buildFaviconUrl } from "@/models/settings";
import type { AnalyticsStats, Link } from "@/models/types";

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

/** Screenshot state — deleting a stored preview lets Connector discover it again. */
function useScreenshotPreview(link: Link, onUpdate: (link: Link) => void) {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(link.screenshotUrl ?? null);
  const [isDeletingScreenshot, setIsDeletingScreenshot] = useState(false);

  useEffect(() => {
    setScreenshotUrl(link.screenshotUrl ?? null);
  }, [link.screenshotUrl]);

  const handleDeleteScreenshot = useCallback(async () => {
    if (isDeletingScreenshot || !screenshotUrl?.trim()) return;
    setIsDeletingScreenshot(true);
    try {
      const result = await deleteScreenshot(link.id, screenshotUrl);
      if (result.success && result.data) {
        setScreenshotUrl(result.data.screenshotUrl ?? null);
        onUpdate(result.data);
        toast.success("截图已删除");
      } else {
        toast.error("删除截图失败", { description: result.error || "请稍后重试" });
      }
    } catch (error) {
      console.error("Failed to delete screenshot:", error);
      toast.error("删除截图失败", { description: "请稍后重试" });
    } finally {
      setIsDeletingScreenshot(false);
    }
  }, [link.id, screenshotUrl, isDeletingScreenshot, onUpdate]);

  return { screenshotUrl, isDeletingScreenshot, handleDeleteScreenshot };
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
        toast.error("刷新元数据失败", {
          description: result.error || "Failed to refresh metadata",
        });
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
function useFaviconState(_metaFavicon: string | null | undefined) {
  const [faviconError, setFaviconError] = useState(false);
  useEffect(() => {
    setFaviconError(false);
  }, []);
  const handleFaviconError = useCallback(() => {
    setFaviconError(true);
  }, []);
  return { faviconError, handleFaviconError };
}

/**
 * ViewModel for a single link card — composes smaller hooks for analytics,
 * preview screenshots, metadata refresh, favicon, copy, and delete.
 */
export function useLinkCardViewModel(
  link: Link,
  siteUrl: string,
  onDelete: (id: number) => void | Promise<void>,
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

  const [isSavingVisibility, setIsSavingVisibility] = useState(false);
  const handleToggleHidden = async () => {
    if (isSavingVisibility) return;
    setIsSavingVisibility(true);
    try {
      const result = await setLinkHidden(link.id, !link.isHidden);
      if (result.success && result.data) {
        onUpdate(result.data);
        toast.success(result.data.isHidden ? "帖子已隐藏" : "已取消隐藏");
      } else toast.error(result.error || "保存隐藏状态失败");
    } catch {
      toast.error("保存隐藏状态失败，请稍后重试");
    } finally {
      setIsSavingVisibility(false);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteLink(link.id);
      if (result.success) await onDelete(link.id);
      else toast.error("删除失败", { description: result.error || "Failed to delete link" });
    } catch {
      toast.error("删除失败", { description: "请稍后重试" });
    } finally {
      setIsDeleting(false);
    }
  }, [link.id, onDelete, isDeleting]);

  return {
    shortUrl,
    isSavingVisibility,
    handleToggleHidden,
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
    canDeleteScreenshot: !!preview.screenshotUrl?.trim() && !getSpecialSource(link.originalUrl),
    isDeletingScreenshot: preview.isDeletingScreenshot,
    handleDeleteScreenshot: preview.handleDeleteScreenshot,
    faviconUrl,
    faviconError: favicon.faviconError,
    handleFaviconError: favicon.handleFaviconError,
  };
}
