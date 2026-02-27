"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { LinkCard } from "./link-card";
import { InboxTriage } from "./inbox-triage";
import { CreateLinkModal } from "./create-link-modal";
import { LinkFilterBar } from "./link-filter-bar";
import { Link2, LayoutList, LayoutGrid, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardService } from "@/contexts/dashboard-service";
import { useAutoRefreshMetadata } from "@/viewmodels/useLinksViewModel";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";

type ViewMode = "list" | "grid";

const VIEW_MODE_KEY = "zhe_links_view_mode";

function getStoredViewMode(): ViewMode {
  if (typeof window === "undefined") return "list";
  const stored = localStorage.getItem(VIEW_MODE_KEY);
  return stored === "grid" ? "grid" : "list";
}

function LinksListSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "grid") {
    return (
      <div className="animate-pulse grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-[14px] bg-secondary overflow-hidden">
            <div className="aspect-[4/3] bg-muted" />
            <div className="p-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[14px] bg-secondary p-4 flex items-center gap-4"
        >
          <div className="h-9 w-9 rounded-lg bg-muted shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-3 w-64 rounded bg-muted" />
          </div>
          <div className="h-8 w-16 rounded bg-muted shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function LinksList() {
  const {
    links, folders, tags, linkTags, loading,
    handleLinkCreated, handleLinkDeleted, handleLinkUpdated,
    handleTagCreated, handleLinkTagAdded, handleLinkTagRemoved,
    refreshLinks,
    siteUrl,
  } = useDashboardService();

  const editCallbacks: EditLinkCallbacks = useMemo(() => ({
    onLinkUpdated: handleLinkUpdated,
    onTagCreated: handleTagCreated,
    onLinkTagAdded: handleLinkTagAdded,
    onLinkTagRemoved: handleLinkTagRemoved,
  }), [handleLinkUpdated, handleTagCreated, handleLinkTagAdded, handleLinkTagRemoved]);

  // Batch-refresh metadata for links missing it (replaces per-card N+1 auto-fetch)
  useAutoRefreshMetadata(links, handleLinkUpdated);

  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterFolderId, setFilterFolderId] = useState<string | null>(null);
  const [filterTagIds, setFilterTagIds] = useState<Set<string>>(new Set());

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshLinks();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshLinks]);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  const searchParams = useSearchParams();
  const selectedFolderId = searchParams.get("folder") ?? null;

  // Pre-group linkTags by linkId so each LinkCard receives only its own tags — O(M) once
  // instead of O(N×M) when every card filters the entire array on each render.
  const linkTagsByLinkId = useMemo(() => {
    const map = new Map<number, typeof linkTags>();
    for (const lt of linkTags) {
      const arr = map.get(lt.linkId);
      if (arr) {
        arr.push(lt);
      } else {
        map.set(lt.linkId, [lt]);
      }
    }
    return map;
  }, [linkTags]);

  const emptyLinkTags: typeof linkTags = useMemo(() => [], []);

  const filteredLinks = useMemo(() => {
    let result = links;

    // 1. Sidebar folder filter (URL param)
    if (selectedFolderId) {
      if (selectedFolderId === "uncategorized") {
        result = result.filter((link) => link.folderId === null);
      } else {
        result = result.filter((link) => link.folderId === selectedFolderId);
      }
    }

    // 2. Filter-bar folder filter (only when sidebar hasn't selected a folder)
    if (!selectedFolderId && filterFolderId) {
      if (filterFolderId === "uncategorized") {
        result = result.filter((link) => link.folderId === null);
      } else {
        result = result.filter((link) => link.folderId === filterFolderId);
      }
    }

    // 3. Tag filter — link must have ALL selected tags (intersection)
    if (filterTagIds.size > 0) {
      result = result.filter((link) => {
        const lt = linkTagsByLinkId.get(link.id);
        if (!lt) return false;
        const linkTagIdSet = new Set(lt.map((t) => t.tagId));
        for (const tagId of filterTagIds) {
          if (!linkTagIdSet.has(tagId)) return false;
        }
        return true;
      });
    }

    return result;
  }, [links, selectedFolderId, filterFolderId, filterTagIds, linkTagsByLinkId]);

  const selectedFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    if (selectedFolderId === "uncategorized") return null;
    return folders.find((f) => f.id === selectedFolderId) ?? null;
  }, [folders, selectedFolderId]);

  const headerTitle = selectedFolderId === "uncategorized"
    ? "Inbox"
    : selectedFolder
      ? selectedFolder.name
      : "全部链接";
  const linkCount = filteredLinks.length;
  const hasActiveFilters = filterFolderId !== null || filterTagIds.size > 0;

  const handleToggleFilterTag = useCallback((tagId: string) => {
    setFilterTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilterFolderId(null);
    setFilterTagIds(new Set());
  }, []);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="animate-pulse">
            <div className="h-6 w-24 rounded bg-muted" />
            <div className="h-4 w-16 rounded bg-muted mt-1.5" />
          </div>
          <div className="h-9 w-24 rounded-lg bg-muted animate-pulse" />
        </div>
        <LinksListSkeleton viewMode={viewMode} />
      </div>
    );
  }

  if (selectedFolderId === "uncategorized") {
    return <InboxTriage />;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{headerTitle}</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
              <button
                onClick={() => handleViewModeChange("list")}
                aria-label="List view"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutList className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => handleViewModeChange("grid")}
                aria-label="Grid view"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-[10px] h-7 w-7 p-0"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="刷新链接"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            </Button>
            <CreateLinkModal siteUrl={siteUrl} onSuccess={handleLinkCreated} folders={folders} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? `${linkCount} / ${links.length} 条链接`
              : `共 ${linkCount} 条链接`}
          </p>
          <LinkFilterBar
            folders={folders}
            tags={tags}
            filterFolderId={filterFolderId}
            filterTagIds={filterTagIds}
            onFolderChange={setFilterFolderId}
            onToggleTag={handleToggleFilterTag}
            onClear={handleClearFilters}
            showFolderFilter={!selectedFolderId}
          />
        </div>
      </div>

      {/* Content */}
      {filteredLinks.length === 0 ? (
        <div className="rounded-[14px] border-0 bg-secondary shadow-none p-12 text-center">
          <Link2
            className="w-10 h-10 mx-auto text-muted-foreground mb-4"
            strokeWidth={1.5}
          />
          <p className="text-sm text-muted-foreground mb-2">暂无链接</p>
          <p className="text-xs text-muted-foreground mb-6">
            点击上方按钮创建您的第一个短链接
          </p>
          <CreateLinkModal siteUrl={siteUrl} onSuccess={handleLinkCreated} folders={folders} />
        </div>
      ) : (
        <div className={
          viewMode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            : "space-y-2"
        }>
          {filteredLinks.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              siteUrl={siteUrl}
              onDelete={handleLinkDeleted}
              onUpdate={handleLinkUpdated}
              viewMode={viewMode}
              tags={tags}
              linkTags={linkTagsByLinkId.get(link.id) ?? emptyLinkTags}
              folders={folders}
              editCallbacks={editCallbacks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
