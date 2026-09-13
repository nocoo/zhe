"use client";

import { Button, LayerCard } from "@nocoo/basalt";
import { BarChart3, Check, Copy, ExternalLink, Pencil, Sparkles } from "lucide-react";
import { memo, useContext, useMemo, useState } from "react";
import { canonicalXPost } from "@/cli/src/connector/core";
import { XBookmarksContext } from "@/contexts/x-bookmarks";
import { extractHostname } from "@/models/links";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { AnalyticsPanel } from "./link-card-parts/analytics-panel";
import { GridView } from "./link-card-parts/grid-view";
import { InlineEditArea } from "./link-card-parts/inline-edit-area";
import { ListView } from "./link-card-parts/list-view";
import { ScreenshotSourceDialog } from "./link-card-parts/screenshot-source-dialog";
import { TagBadge } from "./shared-link-components";
import { XBookmarkContent, XBookmarkStatus } from "./x-bookmark-content";

type ViewMode = "list" | "grid";

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
  const enriched = xBookmarks.get(link.id);
  const xBookmark = enriched?.tweet && enriched.tweet.id !== xPost?.id ? undefined : enriched;

  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(defaultEditing);

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

  // Bundle the common view props once — grid/list share most of them.
  const sharedViewProps = {
    link,
    titleText,
    showFaviconImage,
    shortUrl: vm.shortUrl,
    screenshotUrl: vm.screenshotUrl,
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

  if (xPost && xBookmark?.tweet)
    return (
      <LayerCard padding="none" className="group overflow-hidden" data-testid="link-card">
        {link.note && (
          <LayerCard.Header>
            <p className="whitespace-pre-wrap break-words text-sm font-medium">{link.note}</p>
          </LayerCard.Header>
        )}
        <XBookmarkContent bookmark={xBookmark} />
        <LayerCard.Footer className="flex-wrap gap-2">
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
      <LayerCard padding="none" data-testid="link-card" className="group overflow-hidden">
        <GridView {...sharedViewProps} />
        {xPost && (
          <LayerCard.Footer>
            <XBookmarkStatus bookmark={xBookmark} linkId={link.id} />
          </LayerCard.Footer>
        )}
        {editArea}
        {sourceDialog}
      </LayerCard>
    );
  }

  return (
    <LayerCard data-testid="link-card" className="group">
      <ListView
        {...sharedViewProps}
        isEditing={isEditing}
        showAnalytics={vm.showAnalytics}
        onToggleAnalytics={vm.handleToggleAnalytics}
      />
      {xPost && (
        <div className="mt-3">
          <XBookmarkStatus bookmark={xBookmark} linkId={link.id} />
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
  );
});
