"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  LayerCard,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nocoo/basalt";
import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Pencil,
  Sparkles,
  Tags as TagsIcon,
} from "lucide-react";
import { memo, useContext, useMemo, useRef, useState } from "react";
import { canonicalXPost } from "@/cli/src/connector/core";
import { XBookmarksContext } from "@/contexts/x-bookmarks";
import { extractHostname } from "@/models/links";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import { getXBookmarkForLink, getXPostPresentation } from "@/models/x-bookmarks";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { AnalyticsPanel } from "./link-card-parts/analytics-panel";
import { GridView } from "./link-card-parts/grid-view";
import { InlineEditArea } from "./link-card-parts/inline-edit-area";
import { ListView } from "./link-card-parts/list-view";
import { ScreenshotSourceDialog } from "./link-card-parts/screenshot-source-dialog";
import { TagBadge } from "./shared-link-components";
import {
  XBookmarkContent,
  XBookmarkDetailsButton,
  XBookmarkPending,
  XBookmarkStatus,
} from "./x-bookmark-content";

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
  const isXFeed = viewMode === "feed" && !!xPost;
  const panelClassName = isXFeed ? "p-4" : undefined;
  const folderName = folders.find((folder) => folder.id === link.folderId)?.name ?? "Inbox";

  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(defaultEditing);
  const editTrigger = useRef<HTMLElement | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsTrigger = useRef<HTMLElement | null>(null);
  const openDetails = () => {
    detailsTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    detailsTrigger.current
      ?.closest('[data-testid="link-card"]')
      ?.querySelectorAll("video")
      .forEach((video) => {
        video.pause();
      });
    setDetailsOpen(true);
  };

  const handleToggleEdit = () => {
    if (defaultEditing) return; // defaultEditing cards stay open
    editTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
  const presentation = tweet ? getXPostPresentation(tweet) : null;
  const description = presentation
    ? presentation.text ||
      (presentation.links.some((item) => item.isXArticle)
        ? "X 文章 · 点击阅读全文"
        : presentation.links.map((item) => item.hostname).join(" · ") || "查看帖子与全部附件")
    : link.metaDescription || (xPost ? "内容尚未补全 · 可先查看原帖" : null);

  // Bundle the common view props once — grid/list share most of them.
  const sharedViewProps = {
    link: { ...link, metaDescription: description },
    titleText: tweet ? `${tweet.author.name} (@${tweet.author.username})` : titleText,
    showFaviconImage,
    shortUrl: vm.shortUrl,
    screenshotUrl: xPost ? (cover ?? null) : vm.screenshotUrl,
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
        className={panelClassName}
        link={link}
        tags={tags}
        linkTags={linkTags}
        folders={folders}
        editCallbacks={editCallbacks}
        isDeleting={vm.isDeleting}
        handleDelete={vm.handleDelete}
        defaultEditing={defaultEditing}
        onCloseEdit={() => {
          setIsEditing(false);
          editTrigger.current?.focus();
        }}
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
          {xBookmark?.tweet ? (
            <XBookmarkContent bookmark={xBookmark} note={link.note} title={link.metaTitle} />
          ) : (
            <XBookmarkPending link={link} />
          )}
          <LayerCard.Footer className="flex-wrap gap-3 border-border/60 bg-background/40 px-5">
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

  if (isXFeed)
    return (
      <>
        <LayerCard
          padding="none"
          className="group overflow-hidden rounded-card shadow-card ring-1 ring-border/40 transition-shadow hover:shadow-card-hover"
          data-testid="link-card"
          data-link-id={link.id}
          data-view="feed"
        >
          {xBookmark?.tweet ? (
            <XBookmarkContent
              bookmark={xBookmark}
              note={link.note}
              title={link.metaTitle}
              compact
            />
          ) : (
            <XBookmarkPending link={link} compact />
          )}
          <LayerCard.Footer
            className="gap-1 border-border/60 bg-background/40 px-4 py-1.5"
            data-testid="x-card-footer"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <FolderOpen className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="truncate" title={folderName}>
                  {folderName}
                </span>
              </span>
              {cardTags.length > 0 && (
                <span
                  role="img"
                  className="inline-flex shrink-0 items-center gap-1"
                  title={cardTags.map((tag) => tag.name).join("、")}
                  aria-label={`标签：${cardTags.map((tag) => tag.name).join("、")}`}
                >
                  <TagsIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
                  {cardTags.length}
                </span>
              )}
            </div>
            <TooltipProvider>
              <div className="-mr-2 flex shrink-0 items-center text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={vm.handleCopy}
                      aria-label="Copy link"
                      className="text-muted-foreground"
                    >
                      {vm.copied ? <Check className="text-success" /> : <Copy strokeWidth={1.5} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{vm.copied ? "已复制" : vm.shortUrl}</TooltipContent>
                </Tooltip>
                <XBookmarkDetailsButton bookmark={xBookmark} onClick={openDetails} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" asChild aria-label="打开原帖">
                      <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink strokeWidth={1.5} />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>打开原帖</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={vm.handleToggleAnalytics}
                      aria-label="查看点击统计"
                      aria-expanded={vm.showAnalytics}
                      className="aria-expanded:bg-accent aria-expanded:text-foreground"
                    >
                      <BarChart3 strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>点击统计</TooltipContent>
                </Tooltip>
                {onSuggest && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onSuggest}
                    disabled={suggestDisabled}
                    aria-label="AI 建议"
                    title="AI 建议"
                  >
                    <Sparkles strokeWidth={1.5} />
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleToggleEdit}
                      aria-label="Edit link"
                      aria-expanded={isEditing}
                      className="aria-expanded:bg-accent aria-expanded:text-foreground"
                    >
                      <Pencil strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>编辑收藏</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </LayerCard.Footer>
          <AnalyticsPanel
            className="p-4"
            showAnalytics={vm.showAnalytics}
            analyticsStats={vm.analyticsStats}
            isLoadingAnalytics={vm.isLoadingAnalytics}
          />
          {editArea}
        </LayerCard>
        {detailsDialog}
      </>
    );

  if (viewMode === "grid") {
    return (
      <>
        <LayerCard
          padding="none"
          data-testid="link-card"
          data-link-id={link.id}
          data-view="grid"
          className="group @container h-full overflow-hidden rounded-card shadow-card ring-1 ring-border/40 transition-shadow hover:shadow-card-hover"
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
        padding="none"
        data-testid="link-card"
        data-link-id={link.id}
        data-view={viewMode}
        className="group overflow-hidden rounded-card shadow-card ring-1 ring-border/40 transition-shadow hover:shadow-card-hover"
      >
        <div className="p-4">
          <ListView
            {...sharedViewProps}
            isEditing={isEditing}
            showAnalytics={vm.showAnalytics}
            onToggleAnalytics={vm.handleToggleAnalytics}
          />
        </div>
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
