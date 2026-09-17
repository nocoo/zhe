"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { canonicalGitHubRepo } from "@/cli/src/connector/github-core";
import { GithubIcon } from "@/components/site-icons";
import { AnimatedCardList } from "@/components/ui/animated-card-list";
import { CardListSkeleton } from "@/components/ui/card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader, PageHeaderSkeleton } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardService } from "@/contexts/dashboard-service";
import { sortLinksByDate } from "@/models/links";
import type { LinkTag } from "@/models/types";
import { useGitHubBookmarks } from "@/viewmodels/useGitHubBookmarks";
import { GitHubRepositoryCard } from "./github-repository-card";
import { LinkFilterBar } from "./link-filter-bar";

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
  const [query, setQuery] = useState("");
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
  const search = query.trim().toLowerCase();
  const visible = entries
    .filter(({ link, bookmark }) => {
      if (
        folderId &&
        (folderId === "uncategorized" ? link.folderId !== null : link.folderId !== folderId)
      )
        return false;
      if ([...tagIds].some((id) => !tagsByLink.get(link.id)?.some((tag) => tag.tagId === id)))
        return false;
      const repository = bookmark?.repository;
      const analysis = bookmark?.analysis;
      return (
        !search ||
        [
          link.originalUrl,
          link.metaTitle,
          link.metaDescription,
          link.note,
          repository?.language,
          repository?.fullName,
          ...(repository?.topics ?? []),
          analysis?.summary,
          ...(analysis?.features ?? []),
          ...(analysis?.useCases ?? []),
          ...(analysis?.techStack ?? []),
          ...(analysis?.tags ?? []),
          ...tags
            .filter((tag) => tagsByLink.get(link.id)?.some((assigned) => assigned.tagId === tag.id))
            .map((tag) => tag.name),
        ].some((text) => text?.toLowerCase().includes(search))
      );
    })
    .sort((a, b) =>
      sort === "stars"
        ? (b.bookmark?.repository?.stars ?? -1) - (a.bookmark?.repository?.stars ?? -1)
        : sort === "commits"
          ? (b.bookmark?.repository?.commits ?? -1) - (a.bookmark?.repository?.commits ?? -1)
          : 0,
    );
  if (loading)
    return (
      <>
        <PageHeaderSkeleton hasActions={false} />
        <CardListSkeleton />
      </>
    );
  return (
    <div className="@container/github">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <GithubIcon className="size-6" strokeWidth={1.5} aria-hidden />
            GitHub 收藏
          </span>
        }
        description={`共 ${entries.length} 个仓库 · 默认分支统计与 README 全文`}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <LinkFilterBar
          hasAdditionalFilters={Boolean(query)}
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
            setQuery("");
          }}
          showFolderFilter
        />
        <div className="relative w-full sm:ml-auto sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            size="sm"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索 GitHub 收藏"
            placeholder="搜索仓库、功能、技术栈或备注"
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger size="sm" className="w-36" aria-label="仓库排序">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="saved">最近收藏</SelectItem>
            <SelectItem value="stars">最多 stars</SelectItem>
            <SelectItem value="commits">最多 commits</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p role="status" className="mb-3 text-xs text-muted-foreground">
        显示 {visible.length} 个仓库
      </p>
      {visible.length ? (
        <AnimatedCardList
          className="grid auto-rows-fr grid-cols-1 items-stretch gap-4 @2xl/github:grid-cols-2 @5xl/github:grid-cols-3 @7xl/github:grid-cols-4"
          data-testid="github-repositories"
        >
          {visible.map(({ link, bookmark }) => (
            <GitHubRepositoryCard
              key={link.id}
              link={link}
              bookmark={bookmark}
              folders={folders}
              tags={tags}
              linkTags={tagsByLink.get(link.id) ?? []}
              siteUrl={siteUrl}
              editCallbacks={callbacks}
              onDelete={handleLinkDeleted}
              onRefresh={refresh}
            />
          ))}
        </AnimatedCardList>
      ) : (
        <EmptyState
          icon={GithubIcon}
          title={entries.length ? "没有符合条件的 GitHub 收藏" : "还没有 GitHub 收藏"}
          description={
            entries.length
              ? "试试其他分类、标签或关键词。"
              : "保存 GitHub 仓库链接后，可以在这里阅读仓库信息和 README。"
          }
        />
      )}
    </div>
  );
}
