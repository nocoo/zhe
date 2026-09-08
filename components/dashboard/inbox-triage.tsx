"use client";

import { PageHeader } from "@nocoo/basalt/components/page-header";
import { Inbox as InboxIcon, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LinkCard } from "@/components/dashboard/link-card";
import { Button } from "@/components/ui/button";
import { CardListSkeleton } from "@/components/ui/card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useDashboardService } from "@/contexts/dashboard-service";
import { staggerStyle } from "@/lib/motion";
import type { LinkTag } from "@/models/types";
import { useInboxViewModel } from "@/viewmodels/useInboxViewModel";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { useSuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";
import { SuggestLinkOrgDialog } from "./suggest-link-org-dialog";

function InboxSkeleton() {
  return (
    <div>
      <PageHeader title="Inbox" description="加载中…" />
      <CardListSkeleton rows={3} />
    </div>
  );
}

function InboxEmpty() {
  return (
    <EmptyState icon={InboxIcon} title="Inbox 已清空" description="所有链接都已整理到文件夹中" />
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

  const editCallbacks: EditLinkCallbacks = useMemo(
    () => ({
      onLinkUpdated: handleLinkUpdated,
      onTagCreated: handleTagCreated,
      onLinkTagAdded: handleLinkTagAdded,
      onLinkTagRemoved: handleLinkTagRemoved,
    }),
    [handleLinkUpdated, handleTagCreated, handleLinkTagAdded, handleLinkTagRemoved],
  );

  const vm = useInboxViewModel(links, folders, tags, linkTags, editCallbacks);
  const suggestVm = useSuggestLinkOrgViewModel(editCallbacks);
  useEffect(() => {
    void suggestVm.refreshHasAiKey();
  }, [suggestVm.refreshHasAiKey]);

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
        <div className="space-y-2" data-testid="card-list">
          {vm.inboxLinks.map((link, i) => (
            <div key={link.id} className="animate-fade-up" style={staggerStyle(i)}>
              <LinkCard
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
                onSuggest={() => {
                  void suggestVm.openForLink(link.id);
                }}
                suggestDisabled={!suggestVm.hasAiKey}
              />
            </div>
          ))}
        </div>
      )}
      <SuggestLinkOrgDialog vm={suggestVm} />
    </div>
  );
}
