"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { LinkCard } from "./link-card";
import { CreateLinkModal } from "./create-link-modal";
import { Link2 } from "lucide-react";
import { useLinksViewModel } from "@/viewmodels/useLinksViewModel";

function LinksListSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 w-24 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted mt-1.5" />
        </div>
        <div className="h-9 w-24 rounded-lg bg-muted" />
      </div>

      {/* Link card skeletons */}
      <div className="space-y-2">
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
    </div>
  );
}

export function LinksList() {
  const { links, folders, loading, handleLinkCreated, handleLinkDeleted, handleLinkUpdated, siteUrl } = useLinksViewModel();

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
    return <LinksListSkeleton />;
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
        <CreateLinkModal siteUrl={siteUrl} onSuccess={handleLinkCreated} folders={folders} />
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
        <div className="space-y-2">
          {filteredLinks.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              siteUrl={siteUrl}
              onDelete={handleLinkDeleted}
              onUpdate={handleLinkUpdated}
              folders={folders}
            />
          ))}
        </div>
      )}
    </div>
  );
}
