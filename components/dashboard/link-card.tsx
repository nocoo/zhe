"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  LayerCard,
} from "@nocoo/basalt";
import { memo, useContext, useRef, useState } from "react";
import { canonicalXPost } from "@/cli/src/connector/core";
import { BOOKMARK_CARD_CLASS } from "@/components/ui/card-skeleton";
import { XBookmarksContext } from "@/contexts/x-bookmarks";
import { extractHostname } from "@/models/links";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import { getXBookmarkForLink, getXPostPresentation } from "@/models/x-bookmarks";
import { useBookmarkCardViewModel } from "@/viewmodels/useBookmarkCardViewModel";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { BookmarkCardDialogs } from "./bookmark-card-dialogs";
import { BookmarkCardFooter } from "./bookmark-card-footer";
import { GridView } from "./link-card-parts/grid-view";
import { ListView } from "./link-card-parts/list-view";
import { XBookmarkContent, XBookmarkPending } from "./x-bookmark-content";
import { XBookmarkPreview } from "./x-bookmark-preview";

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
  editCallbacks?: EditLinkCallbacks;
  onSuggest?: () => void;
  suggestDisabled?: boolean;
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
  const vm = useBookmarkCardViewModel({
    link,
    siteUrl,
    onDelete,
    onUpdate,
    onSuggest,
    suggestDisabled,
    editable: !!editCallbacks,
  });
  const xBookmarks = useContext(XBookmarksContext);
  const xPost = canonicalXPost(link.originalUrl);
  const xBookmark = getXBookmarkForLink(link, xBookmarks.get(link.id));
  const isXFeed = viewMode === "feed" && !!xPost;
  const folderName = folders.find((folder) => folder.id === link.folderId)?.name ?? "未分类";
  const cardTags = tags.filter((tag) => linkTags.some((assigned) => assigned.tagId === tag.id));
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
  const tweet = xBookmark?.tweet;
  const media = tweet?.media[0];
  const description = tweet ? getXPostPresentation(tweet).text : link.metaDescription;
  const preview = {
    link: { ...link, metaDescription: description },
    titleText: tweet
      ? `${tweet.author.name} (@${tweet.author.username})`
      : link.metaTitle || extractHostname(link.originalUrl),
    showFaviconImage: !!link.metaFavicon && !vm.faviconError,
    shortUrl: vm.shortUrl,
    screenshotUrl: (media?.type === "PHOTO" ? media.url : media?.thumbnail_url) ?? vm.screenshotUrl,
    faviconUrl: vm.faviconUrl,
    onFaviconError: vm.handleFaviconError,
    onOpenDetails: xPost ? openDetails : undefined,
  };
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
        </LayerCard>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      <LayerCard
        ref={vm.card}
        padding="none"
        className={`${BOOKMARK_CARD_CLASS} ${viewMode === "list" ? "h-auto" : "h-96"}`}
        data-testid="link-card"
        data-card-actions-container
        data-link-id={link.id}
        data-view={viewMode}
      >
        {isXFeed ? (
          <XBookmarkPreview
            link={link}
            bookmark={xBookmark}
            shortUrl={vm.shortUrl}
            onOpenDetails={openDetails}
            onPlayMedia={playMedia}
          />
        ) : viewMode === "grid" ? (
          <GridView {...preview} />
        ) : (
          <ListView {...preview} />
        )}
        <BookmarkCardFooter
          compact={viewMode === "list"}
          link={link}
          folder={folderName}
          tags={cardTags}
          actions={vm.actions}
          triggerRef={vm.menuTrigger}
        />
      </LayerCard>
      {detailsDialog}
      <BookmarkCardDialogs
        vm={vm}
        link={link}
        tags={tags}
        linkTags={linkTags}
        folders={folders}
        editCallbacks={editCallbacks}
        animated={viewMode !== "list"}
      />
    </>
  );
});
