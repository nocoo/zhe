"use client";

import { useMemo, useState } from "react";
import { deleteLink } from "@/actions/links";
import { canonicalGitHubRepo } from "@/cli/src/connector/github-core";
import { GithubIcon } from "@/components/site-icons";
import { AnimatedCardList } from "@/components/ui/animated-card-list";
import { CardGridSkeleton, GITHUB_CARD_GRID_CLASS } from "@/components/ui/card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageHeaderSkeleton } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardService } from "@/contexts/dashboard-service";
import { staggerStyle } from "@/lib/motion";
import { sortLinksByDate } from "@/models/links";
import type { LinkTag } from "@/models/types";
import { useBulkDelete } from "@/viewmodels/useBulkDelete";
import { useGitHubBookmarks } from "@/viewmodels/useGitHubBookmarks";
import { useSuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";
import { BulkDeleteActions, SelectableCard } from "./bulk-delete";
import { GitHubRepositoryCard } from "./github-repository-card";
import { LibraryActions } from "./library-actions";
import { LinkFilterBar } from "./link-filter-bar";
import { SuggestLinkOrgDialog } from "./suggest-link-org-dialog";

export function GitHubLibraryPage() {
  const service = useDashboardService();
  const {
    links,
    folders,
    tags,
    linkTags,
    loading,
    siteUrl,
    handleLinkUpdated,
    handleLinkDeleted,
    handleTagCreated,
    handleLinkTagAdded,
    handleLinkTagRemoved,
  } = service;
  const { bookmarks, refresh } = useGitHubBookmarks(links, handleLinkUpdated);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState(new Set<string>());
  const [sort, setSort] = useState("saved");
  const callbacks = useMemo(
    () => ({
      onLinkUpdated: handleLinkUpdated,
      onTagCreated: handleTagCreated,
      onLinkTagAdded: handleLinkTagAdded,
      onLinkTagRemoved: handleLinkTagRemoved,
    }),
    [handleLinkUpdated, handleTagCreated, handleLinkTagAdded, handleLinkTagRemoved],
  );
  const suggestVm = useSuggestLinkOrgViewModel(callbacks);
  const tagsByLink = useMemo(() => {
    const map = new Map<number, LinkTag[]>();
    for (const tag of linkTags) map.set(tag.linkId, [...(map.get(tag.linkId) ?? []), tag]);
    return map;
  }, [linkTags]);
  const entries = sortLinksByDate(links)
    .filter((link) => canonicalGitHubRepo(link.originalUrl))
    .map((link) => {
      const bookmark = bookmarks.get(link.id);
      return { link, bookmark: bookmark?.sourceUrl === link.originalUrl ? bookmark : undefined };
    });
  const visible = entries
    .filter(({ link }) => {
      if (
        folderId &&
        (folderId === "uncategorized" ? link.folderId !== null : link.folderId !== folderId)
      )
        return false;
      if ([...tagIds].some((id) => !tagsByLink.get(link.id)?.some((tag) => tag.tagId === id)))
        return false;
      return true;
    })
    .sort((a, b) =>
      sort === "stars"
        ? (b.bookmark?.repository?.stars ?? -1) - (a.bookmark?.repository?.stars ?? -1)
        : sort === "commits"
          ? (b.bookmark?.repository?.commits ?? -1) - (a.bookmark?.repository?.commits ?? -1)
          : 0,
    );
  const selection = useBulkDelete(
    visible.map(({ link }) => ({
      id: link.id,
      label: link.title || link.metaTitle || link.originalUrl,
    })),
    async (id) => {
      const result = await deleteLink(id);
      if (result.success) handleLinkDeleted(id);
      return result;
    },
  );
  if (loading)
    return (
      <div className="@container/github">
        <PageHeaderSkeleton />
        <CardGridSkeleton variant="github" gridClass={GITHUB_CARD_GRID_CLASS} count={8} />
      </div>
    );
  return (
    <div className="@container/github">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GithubIcon className="size-6" strokeWidth={1.5} aria-hidden />
            GitHub 收藏
          </span>
        }
        description={
          <span role="status">
            共 {entries.length} 个仓库
            {visible.length !== entries.length ? ` · 显示 ${visible.length} 个` : ""} ·
            默认分支统计与 README 全文
          </span>
        }
        actions={
          <>
            {!selection.active && (
              <>
                <LinkFilterBar
                  folders={folders}
                  tags={tags}
                  filterFolderId={folderId}
                  filterTagIds={tagIds}
                  onFolderChange={setFolderId}
                  onToggleTag={(id) =>
                    setTagIds((current) => {
                      const next = new Set(current);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onClear={() => {
                    setFolderId(null);
                    setTagIds(new Set());
                  }}
                  showFolderFilter
                />
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger size="sm" className="w-32 sm:w-36" aria-label="仓库排序">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saved">最近收藏</SelectItem>
                    <SelectItem value="stars">最多 stars</SelectItem>
                    <SelectItem value="commits">最多 commits</SelectItem>
                  </SelectContent>
                </Select>
                <LibraryActions onRefresh={refresh} />
              </>
            )}
            <BulkDeleteActions selection={selection} />
          </>
        }
      />
      {visible.length ? (
        <AnimatedCardList
          className={GITHUB_CARD_GRID_CLASS}
          masonry
          data-testid="github-repositories"
        >
          {visible.map(({ link, bookmark }, index) => (
            <SelectableCard
              selection={selection}
              itemId={link.id}
              label={link.title || link.metaTitle || link.originalUrl}
              key={link.id}
              className="animate-fade-up motion-reduce:animate-none"
              style={staggerStyle(index)}
            >
              <GitHubRepositoryCard
                link={link}
                bookmark={bookmark}
                folders={folders}
                tags={tags}
                linkTags={tagsByLink.get(link.id) ?? []}
                onSuggest={() => void suggestVm.openForLink(link.id)}
                siteUrl={siteUrl}
                editCallbacks={callbacks}
                onDelete={handleLinkDeleted}
                onRefresh={refresh}
              />
            </SelectableCard>
          ))}
        </AnimatedCardList>
      ) : (
        <EmptyState
          icon={GithubIcon}
          title={entries.length ? "没有符合条件的 GitHub 收藏" : "还没有 GitHub 收藏"}
          description={
            entries.length
              ? "试试其他分类或标签。"
              : "保存 GitHub 仓库链接后，可以在这里阅读仓库信息和 README。"
          }
        />
      )}
      <SuggestLinkOrgDialog vm={suggestVm} />
    </div>
  );
}
