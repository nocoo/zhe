"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Inbox as InboxIcon,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkCard } from "@/components/dashboard/link-card";
import { useDashboardService } from "@/contexts/dashboard-service";
import { useInboxViewModel } from "@/viewmodels/useInboxViewModel";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import type { LinkTag } from "@/models/types";

/** Inbox triage view — shows uncategorized links with inline editing controls */
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
      await refreshLinks();
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

  // Pre-group linkTags by linkId so each LinkCard receives only its own tags — O(M) once
  // instead of O(N×M) when every card filters the entire array on each render.
  const linkTagsByLinkId = useMemo(() => {
    const map = new Map<number, LinkTag[]>();
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

  const emptyLinkTags: LinkTag[] = useMemo(() => [], []);

  if (loading) {
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
            <div key={i} className="rounded-[14px] bg-secondary p-4 space-y-3">
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Inbox</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            共 {vm.inboxLinks.length} 条待整理链接
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-[10px]"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="刷新链接"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
          刷新
        </Button>
      </div>

      {/* Content */}
      {vm.inboxLinks.length === 0 ? (
        <div className="rounded-[14px] border-0 bg-secondary shadow-none p-12 text-center">
          <InboxIcon
            className="w-10 h-10 mx-auto text-muted-foreground mb-4"
            strokeWidth={1.5}
          />
          <p className="text-sm text-muted-foreground mb-2">Inbox 已清空</p>
          <p className="text-xs text-muted-foreground">
            所有链接都已整理到文件夹中
          </p>
        </div>
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
