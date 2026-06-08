"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Inbox as InboxIcon,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LinkCard } from "@/components/dashboard/link-card";
import { useDashboardService } from "@/contexts/dashboard-service";
import { useInboxViewModel } from "@/viewmodels/useInboxViewModel";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import type { LinkTag } from "@/models/types";

function InboxSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="animate-pulse">
          <div className="h-6 w-24 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted mt-1.5" />
        </div>
      </div>
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-card bg-secondary p-4 space-y-3">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
            <div className="flex gap-3">
              <div className="h-8 w-40 rounded bg-muted" />
              <div className="h-8 flex-1 rounded bg-muted" />
              <div className="h-8 w-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxEmpty() {
  return (
    <EmptyState
      icon={InboxIcon}
      title="Inbox 已清空"
      description="所有链接都已整理到文件夹中"
    />
  );
}

/** Inbox triage view — shows uncategorized links with inline editing controls */
function useLinkTagsByLinkId(linkTags: LinkTag[]) {
  return useMemo(() => {
    const map = new Map<number, LinkTag[]>();
    for (const lt of linkTags) {
      const arr = map.get(lt.linkId);
      if (arr) arr.push(lt);
      else map.set(lt.linkId, [lt]);
    }
    return map;
  }, [linkTags]);
}

function InboxHeader({
  count,
  isRefreshing,
  onRefresh,
}: {
  count: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <PageHeader
      title="Inbox"
      description={`共 ${count} 条待整理链接`}
      actions={
        <Button
          variant="outline"
          size="sm"
          className="rounded-widget"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="刷新链接"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
          刷新
        </Button>
      }
    />
  );
}

export function InboxTriage() {
  const {
    links,
    folders,
    tags,
    linkTags,
    loading,
    refreshLinks,
    siteUrl,
    handleLinkUpdated,
    handleLinkDeleted,
    handleTagCreated,
    handleLinkTagAdded,
    handleLinkTagRemoved,
  } = useDashboardService();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshLinks();
      if (result.success) {
        toast.success("已刷新");
      } else {
        toast.error(result.error || "刷新失败");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshLinks]);

  const editCallbacks: EditLinkCallbacks = useMemo(() => ({
    onLinkUpdated: handleLinkUpdated,
    onTagCreated: handleTagCreated,
    onLinkTagAdded: handleLinkTagAdded,
    onLinkTagRemoved: handleLinkTagRemoved,
  }), [handleLinkUpdated, handleTagCreated, handleLinkTagAdded, handleLinkTagRemoved]);

  const vm = useInboxViewModel(links, folders, tags, linkTags, editCallbacks);

  const linkTagsByLinkId = useLinkTagsByLinkId(linkTags);
  const emptyLinkTags: LinkTag[] = useMemo(() => [], []);

  if (loading) return <InboxSkeleton />;

  return (
    <div>
      <InboxHeader
        count={vm.inboxLinks.length}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      {vm.inboxLinks.length === 0 ? (
        <InboxEmpty />
      ) : (
        <div className="space-y-2">
          {vm.inboxLinks.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              siteUrl={siteUrl}
              onDelete={handleLinkDeleted}
              onUpdate={handleLinkUpdated}
              viewMode="list"
              tags={tags}
              linkTags={linkTagsByLinkId.get(link.id) ?? emptyLinkTags}
              folders={folders}
              defaultEditing
              editCallbacks={editCallbacks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
