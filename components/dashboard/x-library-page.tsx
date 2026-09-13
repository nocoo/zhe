"use client";

import { Bookmark, Search } from "lucide-react";
import Link from "next/link";
import { useContext, useMemo, useState } from "react";
import { canonicalXPost } from "@/cli/src/connector/core";
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
import { LinkCard } from "./link-card";

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
  const editCallbacks = useMemo<EditLinkCallbacks>(
    () => ({
      onLinkUpdated: handleLinkUpdated,
      onTagCreated: handleTagCreated,
      onLinkTagAdded: handleLinkTagAdded,
      onLinkTagRemoved: handleLinkTagRemoved,
    }),
    [handleLinkUpdated, handleTagCreated, handleLinkTagAdded, handleLinkTagRemoved],
  );
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
      ].some((value) => value?.toLocaleLowerCase().includes(search))
    );
  });
  const visible =
    contentType === "all" ? scoped : scoped.filter(({ types }) => types.includes(contentType));
  const filtered = folderId !== "all" || contentType !== "all" || !!query;
  const clearFilters = () => {
    setFolderId("all");
    setContentType("all");
    setQuery("");
  };

  if (loading)
    return (
      <>
        <PageHeaderSkeleton hasActions={false} />
        <CardGridSkeleton
          count={6}
          gridClass="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
        />
      </>
    );

  return (
    <div>
      <PageHeader title="X 收藏" description={`汇集所有分类 · 共 ${entries.length} 条收藏`} />
      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={folderId} onValueChange={setFolderId}>
            <SelectTrigger className="w-full sm:w-52" aria-label="筛选分类">
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
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
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
        <fieldset className="flex min-w-0 flex-wrap gap-1.5">
          <legend className="sr-only">内容类型</legend>
          {X_CONTENT_TYPES.map(({ value, label }) => (
            <Button
              key={value}
              variant={contentType === value ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={contentType === value}
              onClick={() => setContentType(value)}
              title={value === "article" ? "长文和带外部链接的帖子" : undefined}
            >
              {label}
              <span aria-hidden className="ml-1 text-xs tabular-nums text-muted-foreground">
                {value === "all"
                  ? scoped.length
                  : scoped.filter(({ types }) => types.includes(value)).length}
              </span>
            </Button>
          ))}
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
        <div className="columns-1 gap-4 md:columns-2 2xl:columns-3" data-testid="x-feed">
          {visible.map(({ link }) => (
            <div key={link.id} className="mb-4 break-inside-avoid">
              <LinkCard
                link={link}
                siteUrl={siteUrl}
                onDelete={handleLinkDeleted}
                onUpdate={handleLinkUpdated}
                viewMode="feed"
                tags={tags}
                linkTags={linkTagsById.get(link.id) ?? []}
                folders={folders}
                editCallbacks={editCallbacks}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
