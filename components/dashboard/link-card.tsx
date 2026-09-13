"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  LayerCard,
} from "@nocoo/basalt";
import { BarChart3, Check, Copy, ExternalLink, Pencil, Sparkles } from "lucide-react";
import { memo, useContext, useMemo, useRef, useState } from "react";
import { canonicalXPost } from "@/cli/src/connector/core";
import { XBookmarksContext } from "@/contexts/x-bookmarks";
import { extractHostname } from "@/models/links";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import { getXBookmarkForLink } from "@/models/x-bookmarks";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { AnalyticsPanel } from "./link-card-parts/analytics-panel";
import { GridView } from "./link-card-parts/grid-view";
import { InlineEditArea } from "./link-card-parts/inline-edit-area";
import { ListView } from "./link-card-parts/list-view";
import { ScreenshotSourceDialog } from "./link-card-parts/screenshot-source-dialog";
import { TagBadge } from "./shared-link-components";
import { XBookmarkContent, XBookmarkStatus } from "./x-bookmark-content";

type ViewMode = "list" | "grid" | "feed";

interface LinkCardProps {
  link: Link;
  siteUrl: string;
  onDelete: (id: number) => void;
  onUpdate: (link: Link) => void;
  viewMode?: ViewMode;
  tags?: Tag[];
  linkTags?: LinkTag[];
  folders?: Folder[];
  /** When true the inline edit area is shown immediately (e.g. Inbox page). */
  defaultEditing?: boolean;
  /** Callbacks for syncing edit mutations to the parent service. */
  editCallbacks?: EditLinkCallbacks;
  onSuggest?: () => void;
  suggestDisabled?: boolean;
}

/**
 * Compute derived display values (tags, hostname, favicon, title) used by
 * both grid and list views. Returns a stable object.
 */
function useCardDisplay(
  link: LinkCardProps["link"],
  tags: NonNullable<LinkCardProps["tags"]>,
  linkTags: NonNullable<LinkCardProps["linkTags"]>,
  faviconError: boolean,
) {
  const assignedTagIds = useMemo(() => new Set(linkTags.map((lt) => lt.tagId)), [linkTags]);
  const cardTags = tags.filter((t) => assignedTagIds.has(t.id));
  const hostname = extractHostname(link.originalUrl);
  return {
    cardTags,
    titleText: link.metaTitle || hostname,
    showFaviconImage: !!link.metaFavicon && !faviconError,
  };
}

export const LinkCard = memo(function LinkCard({
  link,
  siteUrl,
  onDelete,
  onUpdate,
  viewMode = "list",
  tags = [],
  linkTags = [],
  folders = [],
  defaultEditing = false,
  editCallbacks,
  onSuggest,
  suggestDisabled,
}: LinkCardProps) {
  const vm = useLinkCardViewModel(link, siteUrl, onDelete, onUpdate);
  const xBookmarks = useContext(XBookmarksContext);
  const xPost = canonicalXPost(link.originalUrl);
  const xBookmark = getXBookmarkForLink(link, xBookmarks.get(link.id));

  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(defaultEditing);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsTrigger = useRef<HTMLElement | null>(null);
  const openDetails = () => {
    detailsTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetailsOpen(true);
  };

  const handleToggleEdit = () => {
    if (defaultEditing) return; // defaultEditing cards stay open
    setIsEditing((prev) => !prev);
  };

  const { cardTags, titleText, showFaviconImage } = useCardDisplay(
    link,
    tags,
    linkTags,
    vm.faviconError,
  );
  const tweet = xBookmark?.tweet;
  const firstMedia = tweet?.media[0];
  const cover = firstMedia?.type === "PHOTO" ? firstMedia.url : firstMedia?.thumbnail_url;

  // Bundle the common view props once — grid/list share most of them.
  const sharedViewProps = {
    link: tweet ? { ...link, metaDescription: tweet.text } : link,
    titleText: tweet ? `${tweet.author.name} (@${tweet.author.username})` : titleText,
    showFaviconImage,
    shortUrl: vm.shortUrl,
    screenshotUrl: cover ?? vm.screenshotUrl,
    faviconUrl: vm.faviconUrl,
    cardTags,
    copied: vm.copied,
    copiedOriginalUrl: vm.copiedOriginalUrl,
    isFetchingPreview: vm.isFetchingPreview,
    isRefreshingMetadata: vm.isRefreshingMetadata,
    onFaviconError: vm.handleFaviconError,
    onCopy: vm.handleCopy,
    onCopyOriginalUrl: vm.handleCopyOriginalUrl,
    onOpenPreviewDialog: () => setPreviewDialogOpen(true),
    onToggleEdit: handleToggleEdit,
    onRefreshMetadata: vm.handleRefreshMetadata,
    ...(onSuggest ? { onSuggest } : {}),
    ...(suggestDisabled !== undefined ? { suggestDisabled } : {}),
    ...(xPost ? { xBookmark, onOpenDetails: openDetails } : {}),
  };

  const editArea =
    isEditing && editCallbacks ? (
      <InlineEditArea
        link={link}
        tags={tags}
        linkTags={linkTags}
        folders={folders}
        editCallbacks={editCallbacks}
        isDeleting={vm.isDeleting}
        handleDelete={vm.handleDelete}
        defaultEditing={defaultEditing}
        onCloseEdit={() => setIsEditing(false)}
      />
    ) : null;

  const sourceDialog = (
    <ScreenshotSourceDialog
      open={previewDialogOpen}
      onOpenChange={setPreviewDialogOpen}
      onSelect={(source) => {
        setPreviewDialogOpen(false);
        vm.handleFetchPreview(source);
      }}
      isFetching={vm.isFetchingPreview}
    />
  );

  const detailsDialog = xPost && (
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent
        size="xl"
        className="max-h-[90dvh] overflow-y-auto p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          detailsTrigger.current?.focus();
        }}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>X 帖子</DialogTitle>
          <DialogDescription>查看正文与全部附件</DialogDescription>
        </DialogHeader>
        <LayerCard padding="none" className="min-w-0 rounded-none">
          {link.note && (
            <LayerCard.Header>
              <p className="whitespace-pre-wrap break-words text-sm font-medium">{link.note}</p>
            </LayerCard.Header>
          )}
          {xBookmark?.tweet ? (
            <XBookmarkContent bookmark={xBookmark} />
          ) : (
            <LayerCard.Body>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {link.metaDescription || "帖子内容尚未补全，可以先打开原帖查看。"}
              </p>
            </LayerCard.Body>
          )}
          <LayerCard.Footer className="flex-wrap gap-3">
            <XBookmarkStatus bookmark={xBookmark} linkId={link.id} />
            <Button variant="outline" size="sm" className="ml-auto" asChild>
              <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                打开原帖
              </a>
            </Button>
            {cardTags.length > 0 && (
              <div className="flex w-full flex-wrap gap-1">
                {cardTags.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} size="sm" />
                ))}
              </div>
            )}
          </LayerCard.Footer>
        </LayerCard>
      </DialogContent>
    </Dialog>
  );

  if (viewMode === "feed" && xPost)
    return (
      <LayerCard
        padding="none"
        className="group overflow-hidden"
        data-testid="link-card"
        data-link-id={link.id}
        data-view="feed"
      >
        {link.note && (
          <LayerCard.Header>
            <p className="whitespace-pre-wrap break-words text-sm font-medium">{link.note}</p>
          </LayerCard.Header>
        )}
        {xBookmark?.tweet ? (
          <XBookmarkContent bookmark={xBookmark} />
        ) : (
          <LayerCard.Body className="space-y-2">
            {!link.note && (
              <p className="break-words text-sm font-medium">
                {link.metaTitle || link.originalUrl}
              </p>
            )}
            <p className="break-words text-sm text-muted-foreground">
              {link.metaDescription || "帖子内容尚未补全，可以先打开原帖查看。"}
            </p>
          </LayerCard.Body>
        )}
        <LayerCard.Footer className="flex-wrap gap-2">
          <span className="max-w-full truncate text-xs text-muted-foreground">
            {folders.find((folder) => folder.id === link.folderId)?.name ?? "Inbox"}
          </span>
          <XBookmarkStatus bookmark={xBookmark} linkId={link.id} />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button size="sm" variant="ghost" onClick={vm.handleCopy} aria-label="Copy link">
              {vm.copied ? <Check /> : <Copy />}
              {link.slug}
            </Button>
            <Button size="icon" variant="ghost" asChild aria-label="打开原帖">
              <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
              </a>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={vm.handleToggleAnalytics}
              aria-label="查看点击统计"
            >
              <BarChart3 />
            </Button>
            {onSuggest && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onSuggest}
                disabled={suggestDisabled}
                aria-label="AI 建议"
              >
                <Sparkles />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={handleToggleEdit} aria-label="Edit link">
              <Pencil />
            </Button>
          </div>
          {cardTags.length > 0 && (
            <div className="flex w-full flex-wrap gap-1">
              {cardTags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} size="sm" />
              ))}
            </div>
          )}
        </LayerCard.Footer>
        <AnalyticsPanel
          showAnalytics={vm.showAnalytics}
          analyticsStats={vm.analyticsStats}
          isLoadingAnalytics={vm.isLoadingAnalytics}
        />
        {editArea}
      </LayerCard>
    );

  if (viewMode === "grid") {
    return (
      <>
        <LayerCard
          padding="none"
          data-testid="link-card"
          data-link-id={link.id}
          data-view="grid"
          className="group h-full overflow-hidden"
        >
          <GridView {...sharedViewProps} />
          {editArea}
          {sourceDialog}
        </LayerCard>
        {detailsDialog}
      </>
    );
  }

  return (
    <>
      <LayerCard
        data-testid="link-card"
        data-link-id={link.id}
        data-view={viewMode}
        className="group"
      >
        <ListView
          {...sharedViewProps}
          isEditing={isEditing}
          showAnalytics={vm.showAnalytics}
          onToggleAnalytics={vm.handleToggleAnalytics}
        />
        {xPost && (
          <div className="mt-3">
            <XBookmarkStatus bookmark={xBookmark} linkId={link.id} compact={viewMode !== "feed"} />
          </div>
        )}
        <AnalyticsPanel
          showAnalytics={vm.showAnalytics}
          analyticsStats={vm.analyticsStats}
          isLoadingAnalytics={vm.isLoadingAnalytics}
        />
        {editArea}
        {sourceDialog}
      </LayerCard>
      {detailsDialog}
    </>
  );
});
