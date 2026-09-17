"use client";

import {
  AlignLeft,
  Bookmark,
  Clock3,
  FileText,
  Film,
  ImageIcon,
  LayoutGrid,
  Play,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useContext, useMemo, useState } from "react";
import { canonicalXPost } from "@/cli/src/connector/core";
import { TwitterIcon } from "@/components/site-icons";
import { AnimatedCardList } from "@/components/ui/animated-card-list";
import { Button } from "@/components/ui/button";
import { CardGridSkeleton } from "@/components/ui/card-skeleton";
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
import { XBookmarksContext } from "@/contexts/x-bookmarks";
import { sortLinksByDate } from "@/models/links";
import type { LinkTag } from "@/models/types";
import {
  getXBookmarkForLink,
  getXContentTypes,
  X_CONTENT_TYPES,
  type XContentType,
} from "@/models/x-bookmarks";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { useSuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";
import { LinkCard } from "./link-card";
import { TagFilter } from "./link-filter-bar";
import { SuggestLinkOrgDialog } from "./suggest-link-org-dialog";

const contentIcons = {
  all: LayoutGrid,
  video: Play,
  image: ImageIcon,
  gif: Film,
  article: FileText,
  text: AlignLeft,
  pending: Clock3,
};

const X_FEED_CLASS = "gap-3 [column-count:8] [column-width:11rem]";

export function XLibraryPage() {
  const {
    links,
    folders,
    tags,
    linkTags,
    loading,
    siteUrl,
    handleLinkDeleted,
    handleLinkUpdated,
    handleTagCreated,
    handleLinkTagAdded,
    handleLinkTagRemoved,
  } = useDashboardService();
  const bookmarks = useContext(XBookmarksContext);
  const [folderId, setFolderId] = useState("all");
  const [contentType, setContentType] = useState<XContentType>("all");
  const [query, setQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState(new Set<string>());
  const editCallbacks = useMemo<EditLinkCallbacks>(
    () => ({
      onLinkUpdated: handleLinkUpdated,
      onTagCreated: handleTagCreated,
      onLinkTagAdded: handleLinkTagAdded,
      onLinkTagRemoved: handleLinkTagRemoved,
    }),
    [handleLinkUpdated, handleTagCreated, handleLinkTagAdded, handleLinkTagRemoved],
  );
  const suggestVm = useSuggestLinkOrgViewModel(editCallbacks);
  const linkTagsById = useMemo(() => {
    const grouped = new Map<number, LinkTag[]>();
    for (const tag of linkTags) {
      const items = grouped.get(tag.linkId);
      if (items) items.push(tag);
      else grouped.set(tag.linkId, [tag]);
    }
    return grouped;
  }, [linkTags]);
  const entries = useMemo(
    () =>
      sortLinksByDate(links)
        .filter((link) => canonicalXPost(link.originalUrl))
        .map((link) => {
          const bookmark = getXBookmarkForLink(link, bookmarks.get(link.id));
          const types = getXContentTypes(bookmark?.tweet);
          if (bookmark?.tweet && bookmark.state !== "complete") types.push("pending");
          return { link, bookmark, types };
        }),
    [links, bookmarks],
  );
  const search = query.trim().toLocaleLowerCase();
  const scoped = entries.filter(({ link, bookmark }) => {
    if (
      folderId !== "all" &&
      (folderId === "uncategorized" ? link.folderId !== null : link.folderId !== folderId)
    )
      return false;
    if (
      [...selectedTagIds].some((id) => !linkTagsById.get(link.id)?.some((tag) => tag.tagId === id))
    )
      return false;
    const tweet = bookmark?.tweet;
    return (
      !search ||
      [
        link.note,
        link.metaTitle,
        link.metaDescription,
        link.originalUrl,
        tweet?.text,
        tweet?.author.name,
        tweet?.author.username,
        ...tags
          .filter((tag) => linkTagsById.get(link.id)?.some((assigned) => assigned.tagId === tag.id))
          .map((tag) => tag.name),
      ].some((value) => value?.toLocaleLowerCase().includes(search))
    );
  });
  const visible =
    contentType === "all" ? scoped : scoped.filter(({ types }) => types.includes(contentType));
  const filtered =
    folderId !== "all" || contentType !== "all" || !!query || selectedTagIds.size > 0;
  const clearFilters = () => {
    setFolderId("all");
    setContentType("all");
    setQuery("");
    setSelectedTagIds(new Set());
  };

  if (loading)
    return (
      <>
        <PageHeaderSkeleton hasActions={false} />
        <CardGridSkeleton
          count={16}
          aspectClass="aspect-[4/5]"
          gridClass={`${X_FEED_CLASS} [&>div]:mb-3 [&>div]:break-inside-avoid`}
        />
      </>
    );

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <TwitterIcon className="size-6" strokeWidth={1.5} aria-hidden />X 收藏
          </span>
        }
        description={`汇集所有分类 · 共 ${entries.length} 条收藏`}
      />
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select value={folderId} onValueChange={setFolderId}>
            <SelectTrigger size="sm" className="w-full sm:w-52" aria-label="筛选分类">
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              <SelectItem value="uncategorized">Inbox · 未分类</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TagFilter
            tags={tags}
            selectedTagIds={selectedTagIds}
            onToggle={(id) =>
              setSelectedTagIds((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          />
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              size="sm"
              type="search"
              aria-label="搜索 X 收藏"
              placeholder="搜索正文、作者或备注"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="self-start sm:self-center"
            >
              清除筛选
            </Button>
          )}
        </div>
        <fieldset className="flex min-w-0 flex-wrap gap-1 border-b border-border/60 pb-3">
          <legend className="sr-only">内容类型</legend>
          {X_CONTENT_TYPES.map(({ value, label }) => {
            const Icon = contentIcons[value];
            return (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                className={
                  contentType === value
                    ? "bg-secondary text-foreground shadow-xs ring-1 ring-border/60"
                    : "text-muted-foreground"
                }
                aria-pressed={contentType === value}
                onClick={() => setContentType(value)}
                title={value === "article" ? "长文和带外部链接的帖子" : undefined}
              >
                <Icon
                  className={contentType === value ? "text-primary" : ""}
                  strokeWidth={1.5}
                  aria-hidden
                />
                {label}
                <span
                  aria-hidden
                  className="min-w-4 rounded-full bg-background/70 px-1 text-[11px] tabular-nums text-muted-foreground"
                >
                  {value === "all"
                    ? scoped.length
                    : scoped.filter(({ types }) => types.includes(value)).length}
                </span>
              </Button>
            );
          })}
        </fieldset>
        <p role="status" className="text-xs text-muted-foreground">
          显示 {visible.length} 条收藏
          {contentType === "article" ? " · 包含长文和带外部链接的帖子" : ""}
        </p>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={entries.length ? "没有符合条件的 X 收藏" : "还没有 X 收藏"}
          description={
            entries.length
              ? "试试其他分类、内容类型或关键词。"
              : "保存 X 帖子链接后，可以在这里集中阅读。"
          }
          action={
            entries.length ? (
              <Button variant="outline" onClick={clearFilters}>
                清除筛选
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href="/dashboard">管理链接</Link>
              </Button>
            )
          }
        />
      ) : (
        <AnimatedCardList
          className={X_FEED_CLASS}
          itemClassName="mb-3 break-inside-avoid pt-px"
          data-testid="x-feed"
        >
          {visible.map(({ link }) => (
            <LinkCard
              key={link.id}
              link={link}
              onSuggest={() => void suggestVm.openForLink(link.id)}
              siteUrl={siteUrl}
              onDelete={handleLinkDeleted}
              onUpdate={handleLinkUpdated}
              viewMode="feed"
              tags={tags}
              linkTags={linkTagsById.get(link.id) ?? []}
              folders={folders}
              editCallbacks={editCallbacks}
            />
          ))}
        </AnimatedCardList>
      )}
      <SuggestLinkOrgDialog vm={suggestVm} />
    </div>
  );
}
