"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { LinkCard } from "./link-card";
import { CreateLinkModal } from "./create-link-modal";
import { Link2, LayoutList, LayoutGrid } from "lucide-react";
import { useDashboardService } from "@/contexts/dashboard-service";

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
  const { links, folders, loading, handleLinkCreated, handleLinkDeleted, handleLinkUpdated, siteUrl } = useDashboardService();

  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  const searchParams = useSearchParams();
  const selectedFolderId = searchParams.get("folder") ?? null;

  const filteredLinks = useMemo(() => {
    if (!selectedFolderId) return links;
    if (selectedFolderId === "uncategorized") {
      return links.filter((link) => link.folderId === null);
    }
    return links.filter((link) => link.folderId === selectedFolderId);
  }, [links, selectedFolderId]);

  const selectedFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    if (selectedFolderId === "uncategorized") return null;
    return folders.find((f) => f.id === selectedFolderId) ?? null;
  }, [folders, selectedFolderId]);

  const headerTitle = selectedFolderId === "uncategorized"
    ? "未分类"
    : selectedFolder
      ? selectedFolder.name
      : "全部链接";
  const linkCount = filteredLinks.length;

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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{headerTitle}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            共 {linkCount} 条链接
          </p>
        </div>
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
          <CreateLinkModal siteUrl={siteUrl} onSuccess={handleLinkCreated} folders={folders} />
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
              folders={folders}
              viewMode={viewMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
