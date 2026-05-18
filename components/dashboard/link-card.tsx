"use client";

import { memo, useMemo, useState } from "react";
import { useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { extractHostname } from "@/models/links";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";

import { InlineEditArea } from "./link-card-parts/inline-edit-area";
import { ScreenshotSourceDialog } from "./link-card-parts/screenshot-source-dialog";
import { AnalyticsPanel } from "./link-card-parts/analytics-panel";
import { GridView } from "./link-card-parts/grid-view";
import { ListView } from "./link-card-parts/list-view";

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
  const assignedTagIds = useMemo(
    () => new Set(linkTags.map((lt) => lt.tagId)),
    [linkTags],
  );
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
}: LinkCardProps) {
  const vm = useLinkCardViewModel(link, siteUrl, onDelete, onUpdate);

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
  };

  const editArea = isEditing && editCallbacks ? (
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
      onSelect={(source) => { setPreviewDialogOpen(false); vm.handleFetchPreview(source); }}
      isFetching={vm.isFetchingPreview}
    />
  );

  if (viewMode === "grid") {
    return (
      <div data-testid="link-card" className="group rounded-card border-0 bg-secondary shadow-none overflow-hidden transition-colors">
        <GridView {...sharedViewProps} />
        {editArea}
        {sourceDialog}
      </div>
    );
  }

  return (
    <div data-testid="link-card" className="rounded-card border-0 bg-secondary shadow-none p-4 transition-colors">
      <ListView
        {...sharedViewProps}
        isEditing={isEditing}
        showAnalytics={vm.showAnalytics}
        onToggleAnalytics={vm.handleToggleAnalytics}
      />
      <AnalyticsPanel
        showAnalytics={vm.showAnalytics}
        analyticsStats={vm.analyticsStats}
        isLoadingAnalytics={vm.isLoadingAnalytics}
      />
      {editArea}
      {sourceDialog}
    </div>
  );
});
