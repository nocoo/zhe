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
} from "lucide-react";
import Link from "next/link";
import { useContext, useMemo, useState } from "react";
import { canonicalXPost } from "@/cli/src/connector/core";
import { TwitterIcon } from "@/components/site-icons";
import { AnimatedCardList } from "@/components/ui/animated-card-list";
import { Button } from "@/components/ui/button";
import { CardGridSkeleton } from "@/components/ui/card-skeleton";
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
  const scoped = entries.filter(({ link }) => {
    if (
      folderId !== "all" &&
      (folderId === "uncategorized" ? link.folderId !== null : link.folderId !== folderId)
    )
      return false;
    if (
      [...selectedTagIds].some((id) => !linkTagsById.get(link.id)?.some((tag) => tag.tagId === id))
    )
      return false;
    return true;
  });
  const visible =
    contentType === "all" ? scoped : scoped.filter(({ types }) => types.includes(contentType));
  const filtered = folderId !== "all" || contentType !== "all" || selectedTagIds.size > 0;
  const clearFilters = () => {
    setFolderId("all");
    setContentType("all");
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
        description={
          <span role="status">
            共 {entries.length} 条收藏{filtered ? ` · 显示 ${visible.length} 条` : ""}
            {contentType === "article" ? " · 包含长文和带外部链接的帖子" : ""}
          </span>
        }
        actions={
          <>
            <Select
              value={contentType}
              onValueChange={(value) => setContentType(value as XContentType)}
            >
              <SelectTrigger size="sm" className="w-28 sm:w-40" aria-label="内容类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="min-w-40">
                {X_CONTENT_TYPES.map(({ value, label }) => {
                  const Icon = contentIcons[value];
                  const count =
                    value === "all"
                      ? scoped.length
                      : scoped.filter(({ types }) => types.includes(value)).length;
                  return (
                    <SelectItem key={value} value={value}>
                      <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span>{label}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger size="sm" className="w-28 sm:w-40" aria-label="筛选分类">
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
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                清除筛选
              </Button>
            )}
          </>
        }
      />
      {visible.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={entries.length ? "没有符合条件的 X 收藏" : "还没有 X 收藏"}
          description={
            entries.length
              ? "试试其他分类、内容类型或标签。"
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
