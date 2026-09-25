"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  LayerCard,
} from "@nocoo/basalt";
import { BarChart3, Check, Copy, ExternalLink, FolderOpen, Pencil, Sparkles } from "lucide-react";
import { memo, useContext, useMemo, useRef, useState } from "react";
import { canonicalXPost } from "@/cli/src/connector/core";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { XBookmarksContext } from "@/contexts/x-bookmarks";
import { extractHostname } from "@/models/links";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import { getXBookmarkForLink, getXPostPresentation } from "@/models/x-bookmarks";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { CardActions } from "./card-actions";
import { IconAction } from "./icon-action";
import { AnalyticsPanel } from "./link-card-parts/analytics-panel";
import { CardEditDialog } from "./link-card-parts/card-edit-dialog";
import { GridView } from "./link-card-parts/grid-view";
import { ListView } from "./link-card-parts/list-view";
import { TagBadge } from "./shared-link-components";
import { useLinkSecondaryActions } from "./use-link-secondary-actions";
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
  editCallbacks,
  onSuggest,
  suggestDisabled,
}: LinkCardProps) {
  const card = useRef<HTMLDivElement | null>(null);
  const [deleted, setDeleted] = useState(false);
  const vm = useLinkCardViewModel(link, siteUrl, () => setDeleted(true), onUpdate);
  const xBookmarks = useContext(XBookmarksContext);
  const xPost = canonicalXPost(link.originalUrl);
  const xBookmark = getXBookmarkForLink(link, xBookmarks.get(link.id));
  const isXFeed = viewMode === "feed" && !!xPost;
  const folderName = folders.find((folder) => folder.id === link.folderId)?.name ?? "未分类";

  const [isEditing, setIsEditing] = useState(false);
  const editTrigger = useRef<HTMLElement | null>(null);
  const cardMenuTrigger = useRef<HTMLButtonElement | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [playMediaId, setPlayMediaId] = useState<string>();
  const detailsTrigger = useRef<HTMLElement | null>(null);
  const openDetails = () => {
    detailsTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPlayMediaId(undefined);
    setDetailsOpen(true);
  };
  const playMedia = (id: string) => {
    openDetails();
    setPlayMediaId(id);
  };

  const handleToggleEdit = () => {
    if (!editCallbacks) return;
    editTrigger.current =
      cardMenuTrigger.current ??
      card.current?.querySelector<HTMLElement>('[aria-label="Edit link"]') ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setIsEditing(true);
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
  const articleDescription =
    presentation?.links.some((item) => item.isXArticle) && "X 文章 · 点击阅读全文";
  const pendingDescription = xPost ? "内容尚未补全 · 可先查看原帖" : null;
  const description = presentation
    ? presentation.text ||
      articleDescription ||
      presentation.links.map((item) => item.hostname).join(" · ") ||
      "查看帖子与全部附件"
    : link.metaDescription || pendingDescription;

  const secondaryActions = useLinkSecondaryActions(
    link,
    vm.isSavingVisibility,
    vm.handleToggleHidden,
  );

  // Bundle the common view props once — grid/list share most of them.
  const sharedViewProps = {
    secondaryActions,
    link: { ...link, metaDescription: description },
    titleText: tweet ? `${tweet.author.name} (@${tweet.author.username})` : titleText,
    showFaviconImage,
    shortUrl: vm.shortUrl,
    screenshotUrl: cover ?? vm.screenshotUrl,
    faviconUrl: vm.faviconUrl,
    cardTags,
    copied: vm.copied,
    copiedOriginalUrl: vm.copiedOriginalUrl,
    canDeleteScreenshot: vm.canDeleteScreenshot,
    isDeletingScreenshot: vm.isDeletingScreenshot,
    isRefreshingMetadata: vm.isRefreshingMetadata,
    onFaviconError: vm.handleFaviconError,
    onCopy: vm.handleCopy,
    onCopyOriginalUrl: vm.handleCopyOriginalUrl,
    onDeleteScreenshot: vm.handleDeleteScreenshot,
    onToggleEdit: handleToggleEdit,
    onRefreshMetadata: vm.handleRefreshMetadata,
    ...(onSuggest ? { onSuggest } : {}),
    ...(suggestDisabled !== undefined ? { suggestDisabled } : {}),
    ...(xPost ? { xBookmark, onOpenDetails: openDetails } : {}),
  };

  const editDialog =
    isEditing && editCallbacks ? (
      <CardEditDialog
        source={card}
        trigger={editTrigger}
        animated={viewMode !== "list"}
        link={link}
        tags={tags}
        linkTags={linkTags}
        folders={folders}
        editCallbacks={editCallbacks}
        isDeleting={vm.isDeleting}
        handleDelete={vm.handleDelete}
        deleted={deleted}
        onClose={() => setIsEditing(false)}
        onDeleted={() => onDelete(link.id)}
      />
    ) : null;

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
            <XBookmarkContent
              bookmark={xBookmark}
              note={link.note}
              title={link.title}
              originalTitle={link.metaTitle}
              playMediaId={playMediaId}
            />
          ) : (
            <XBookmarkPending link={link} />
          )}
          <LayerCard.Footer className="flex-wrap gap-3 border-border/60 bg-background/40 px-5">
            <XBookmarkStatus
              bookmark={xBookmark}
              linkId={link.id}
              actions={
                <IconAction label="打开原帖" asChild>
                  <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink />
                    <span className="sr-only">打开原帖</span>
                  </a>
                </IconAction>
              }
            />
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
          ref={card}
          padding="none"
          className="group overflow-hidden rounded-card shadow-card ring-1 ring-border/40 transition-shadow hover:shadow-card-hover"
          data-testid="link-card"
          data-card-actions-container
          data-link-id={link.id}
          data-view="feed"
        >
          {xBookmark?.tweet ? (
            <XBookmarkContent
              bookmark={xBookmark}
              note={link.note}
              title={link.title}
              originalTitle={link.metaTitle}
              compact
              onPlayMedia={playMedia}
            />
          ) : (
            <XBookmarkPending link={link} compact />
          )}
          <LayerCard.Footer
            className="flex-wrap gap-x-2 gap-y-0 border-border/60 bg-background/40 px-3 py-1.5"
            data-testid="x-card-footer"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <FolderOpen className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="truncate" title={folderName}>
                  {folderName}
                </span>
              </span>
            </div>
            <CardActions
              className="ml-auto text-muted-foreground"
              triggerRef={cardMenuTrigger}
              primary={<XBookmarkDetailsButton bookmark={xBookmark} onClick={openDetails} />}
              secondary={secondaryActions}
              menuItems={
                <>
                  <DropdownMenuItem onSelect={vm.handleCopy}>
                    {vm.copied ? (
                      <Check className="text-success" aria-hidden />
                    ) : (
                      <Copy aria-hidden />
                    )}
                    {vm.copied ? "已复制" : "复制短链接"}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden />
                      打开原帖
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={vm.handleToggleAnalytics}>
                    <BarChart3 aria-hidden />
                    点击统计
                  </DropdownMenuItem>
                  {onSuggest && (
                    <DropdownMenuItem onSelect={onSuggest} disabled={suggestDisabled}>
                      <Sparkles aria-hidden />
                      AI 整理
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={handleToggleEdit}>
                    <Pencil aria-hidden />
                    {isEditing ? "收起编辑" : "编辑收藏"}
                  </DropdownMenuItem>
                </>
              }
            />
            {cardTags.length > 0 && (
              <div className="flex w-full flex-wrap gap-1" data-testid="x-card-tags">
                {cardTags.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} size="sm" />
                ))}
              </div>
            )}
          </LayerCard.Footer>
          <AnalyticsPanel
            className="p-4"
            showAnalytics={vm.showAnalytics}
            analyticsStats={vm.analyticsStats}
            isLoadingAnalytics={vm.isLoadingAnalytics}
          />
        </LayerCard>
        {detailsDialog}
        {editDialog}
      </>
    );

  if (viewMode === "grid") {
    return (
      <>
        <LayerCard
          ref={card}
          padding="none"
          data-testid="link-card"
          data-card-actions-container
          data-link-id={link.id}
          data-view="grid"
          className="group @container h-full overflow-hidden rounded-card shadow-card ring-1 ring-border/40 transition-shadow hover:shadow-card-hover"
        >
          <GridView {...sharedViewProps} />
        </LayerCard>
        {detailsDialog}
        {editDialog}
      </>
    );
  }

  return (
    <>
      <LayerCard
        ref={card}
        padding="none"
        data-testid="link-card"
        data-card-actions-container
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
      </LayerCard>
      {detailsDialog}
      {editDialog}
    </>
  );
});
