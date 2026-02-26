"use client";

import { memo, useMemo, useState } from "react";
import {
  Copy,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Pencil,
  Loader2,
  RefreshCw,
  Link2,
  ImageIcon,
  Camera,
} from "lucide-react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatNumber } from "@/lib/utils";
import { useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { useInlineLinkEditViewModel } from "@/viewmodels/useLinksViewModel";
import { extractHostname } from "@/models/links";
import { topBreakdownEntries } from "@/models/links";
import { DeleteLinkDialog, TagBadge, TagPicker } from "@/components/dashboard/shared-link-components";
import type { Link, Tag, LinkTag, Folder } from "@/models/types";
import type { ScreenshotSource } from "@/models/links";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";

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
  /** When true the inline edit area is shown immediately (e.g. Inbox page) */
  defaultEditing?: boolean;
  /** Callbacks for syncing edit mutations to the parent service */
  editCallbacks?: EditLinkCallbacks;
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
  const {
    shortUrl,
    copied,
    copiedOriginalUrl,
    isDeleting,
    showAnalytics,
    analyticsStats,
    isLoadingAnalytics,
    handleCopy,
    handleCopyOriginalUrl,
    handleDelete,
    handleToggleAnalytics,
    handleRefreshMetadata,
    isRefreshingMetadata,
    screenshotUrl,
    isFetchingPreview,
    handleFetchPreview,
    faviconUrl,
    faviconError,
    handleFaviconError,
  } = useLinkCardViewModel(link, siteUrl, onDelete, onUpdate);

  // Screenshot source picker dialog
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  const onSelectSource = (source: ScreenshotSource) => {
    setPreviewDialogOpen(false);
    handleFetchPreview(source);
  };

  // --- Edit mode ---
  const [isEditing, setIsEditing] = useState(defaultEditing);

  const handleToggleEdit = () => {
    // defaultEditing cards are always open — ignore toggle
    if (defaultEditing) return;
    setIsEditing((prev) => !prev);
  };

  // Tags assigned to this specific link — derived from linkTags prop
  const assignedTagIds = useMemo(() => {
    return new Set(linkTags.filter((lt) => lt.linkId === link.id).map((lt) => lt.tagId));
  }, [linkTags, link.id]);
  const cardTags = tags.filter((t) => assignedTagIds.has(t.id));

  // --- Shared display logic (unified across list & grid) ---
  const hostname = extractHostname(link.originalUrl);
  // Favicon: show metaFavicon image unless it errored (404), else show bg+icon placeholder
  const showFaviconImage = !!link.metaFavicon && !faviconError;
  // Title text after the note (if any): metaTitle or hostname fallback
  const titleText = link.metaTitle || hostname;

  if (viewMode === "grid") {
    return (
      <div data-testid="link-card" className="group rounded-[14px] border-0 bg-secondary shadow-none overflow-hidden transition-colors">
        {/* Screenshot — top, full width */}
        <div
          className="relative block w-full aspect-[4/3] bg-accent cursor-pointer"
          onClick={() => window.open(link.originalUrl, "_blank", "noopener,noreferrer")}
        >
          {screenshotUrl ? (
            <Image
              src={screenshotUrl}
              alt="Screenshot"
              fill
              className="object-cover"
              unoptimized
            />
          ) : faviconUrl ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Image
                src={faviconUrl}
                alt="Site favicon"
                width={48}
                height={48}
                className="w-12 h-12 object-contain"
                unoptimized
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
          )}

          {/* Hover action overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setPreviewDialogOpen(true); }}
              disabled={isFetchingPreview}
              aria-label="Refresh preview"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              title="刷新预览图"
            >
              {isFetchingPreview ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Camera className="w-4 h-4" strokeWidth={1.5} />
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleEdit(); }}
              aria-label="Edit link"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              title="Edit link"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Compact info */}
        <div className="p-3 space-y-1">
          {/* Unified title row: [favicon] note | title/hostname */}
          <div className="flex items-center gap-1.5">
            {showFaviconImage ? (
              <Image
                src={link.metaFavicon!}
                alt="favicon"
                width={14}
                height={14}
                className="w-3.5 h-3.5 shrink-0 rounded-sm"
                unoptimized
                onError={handleFaviconError}
              />
            ) : (
              <div className="w-3.5 h-3.5 shrink-0 rounded-sm bg-accent flex items-center justify-center">
                <Link2 className="w-2.5 h-2.5 text-muted-foreground/60" strokeWidth={2} />
              </div>
            )}
            <a
              href={link.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:underline truncate"
            >
              {link.note ? (
                <>
                  <span>{link.note}</span>
                  <span className="mx-1.5 text-border">|</span>
                  <span className="text-muted-foreground">{titleText}</span>
                </>
              ) : titleText}
            </a>
            <button
              onClick={(e) => { e.stopPropagation(); handleCopyOriginalUrl(); }}
              aria-label="Copy original URL"
              className="shrink-0 flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Copy original URL"
            >
              {copiedOriginalUrl ? (
                <Check className="w-3 h-3 text-success" strokeWidth={1.5} />
              ) : (
                <Copy className="w-3 h-3" strokeWidth={1.5} />
              )}
            </button>
          </div>

          {/* Unified description */}
          {link.metaDescription ? (
            <p className="text-xs text-muted-foreground/70 truncate">{link.metaDescription}</p>
          ) : (
            <p className="text-xs text-muted-foreground/40 truncate">
              未抓取描述 ·{" "}
              <button
                onClick={handleRefreshMetadata}
                disabled={isRefreshingMetadata}
                className="hover:text-muted-foreground underline underline-offset-2 transition-colors"
              >
                {isRefreshingMetadata ? "抓取中..." : "点击抓取"}
              </button>
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Link2 className="w-3 h-3" strokeWidth={1.5} />
              <a
                href={shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                {link.slug}
              </a>
              <button
                onClick={handleCopy}
                aria-label="Copy link"
                className="flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Copy link"
              >
                {copied ? (
                  <Check className="w-2.5 h-2.5 text-success" strokeWidth={1.5} />
                ) : (
                  <Copy className="w-2.5 h-2.5" strokeWidth={1.5} />
                )}
              </button>
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
              {formatNumber(link.clicks ?? 0)} 次点击
            </span>
            <span>{formatDate(link.createdAt)}</span>
          </div>
          {/* Tag badges in grid mode */}
          {cardTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {cardTags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} size="sm" />
              ))}
            </div>
          )}
        </div>

        {/* Inline edit mode */}
        {isEditing && editCallbacks && (
          <InlineEditArea
            link={link}
            tags={tags}
            linkTags={linkTags}
            folders={folders}
            editCallbacks={editCallbacks}
            isDeleting={isDeleting}
            handleDelete={handleDelete}
            defaultEditing={defaultEditing}
            onCloseEdit={() => setIsEditing(false)}
          />
        )}

        {/* Screenshot source picker dialog */}
        <ScreenshotSourceDialog
          open={previewDialogOpen}
          onOpenChange={setPreviewDialogOpen}
          onSelect={onSelectSource}
          isFetching={isFetchingPreview}
        />
      </div>
    );
  }

  return (
    <div data-testid="link-card" className="rounded-[14px] border-0 bg-secondary shadow-none p-4 transition-colors">
      <div className="flex items-stretch gap-4">
        {/* Screenshot/favicon thumbnail — left side, 118x62 (≈19:10), object-top crop */}
        <div className="group/thumb relative shrink-0 hidden sm:flex w-[118px] h-[62px] rounded-md border border-border/50 bg-accent items-center justify-center overflow-hidden">
          {screenshotUrl ? (
            <a
              href={link.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full"
            >
              <Image
                src={screenshotUrl}
                alt="Screenshot"
                width={118}
                height={62}
                className="w-full h-full object-cover object-top"
                unoptimized
              />
            </a>
          ) : faviconUrl ? (
            <div className="flex items-center justify-center w-full h-full">
              <Image
                src={faviconUrl}
                alt="Site favicon"
                width={40}
                height={40}
                className="w-10 h-10 object-contain"
                unoptimized
              />
            </div>
          ) : (
            <ImageIcon className="w-5 h-5 text-muted-foreground/40" strokeWidth={1.5} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Unified title row: [favicon/placeholder] note | title/hostname — clickable link + copy button */}
          <div className="flex items-center gap-2 mb-1">
            {showFaviconImage ? (
              <Image
                src={link.metaFavicon!}
                alt="favicon"
                width={16}
                height={16}
                className="w-4 h-4 shrink-0 rounded-sm"
                unoptimized
                onError={handleFaviconError}
              />
            ) : (
              <div className="w-4 h-4 shrink-0 rounded-sm bg-accent flex items-center justify-center">
                <Link2 className="w-3 h-3 text-muted-foreground/60" strokeWidth={2} />
              </div>
            )}
            <a
              href={link.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:underline truncate"
            >
              {link.note ? (
                <>
                  <span>{link.note}</span>
                  <span className="mx-1.5 text-border">|</span>
                  <span className="text-muted-foreground">{titleText}</span>
                </>
              ) : titleText}
            </a>
            <button
              onClick={handleCopyOriginalUrl}
              aria-label="Copy original URL"
              className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Copy original URL"
            >
              {copiedOriginalUrl ? (
                <Check className="w-3 h-3 text-success" strokeWidth={1.5} />
              ) : (
                <Copy className="w-3 h-3" strokeWidth={1.5} />
              )}
            </button>
          </div>

          {/* Unified description: show metaDescription or unfetched hint */}
          {link.metaDescription ? (
            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
              {link.metaDescription}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/40 truncate mt-0.5">
              未抓取描述 ·{" "}
              <button
                onClick={handleRefreshMetadata}
                disabled={isRefreshingMetadata}
                className="hover:text-muted-foreground underline underline-offset-2 transition-colors"
              >
                {isRefreshingMetadata ? "抓取中..." : "点击抓取"}
              </button>
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Link2 className="w-3 h-3" strokeWidth={1.5} />
              <a
                href={shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                {link.slug}
              </a>
              <button
                onClick={handleCopy}
                aria-label="Copy link"
                className="flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Copy link"
              >
                {copied ? (
                  <Check className="w-2.5 h-2.5 text-success" strokeWidth={1.5} />
                ) : (
                  <Copy className="w-2.5 h-2.5" strokeWidth={1.5} />
                )}
              </button>
            </span>
            <button
              onClick={handleToggleAnalytics}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
              <span>{formatNumber(link.clicks ?? 0)} 次点击</span>
              {showAnalytics ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
            <span>{formatDate(link.createdAt)}</span>
            {link.expiresAt && (
              <span className="text-destructive">
                过期: {formatDate(link.expiresAt)}
              </span>
            )}
            {cardTags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} size="sm" />
            ))}
          </div>
        </div>

        {/* Actions — simplified: refresh metadata, refresh preview, edit toggle */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleRefreshMetadata}
            disabled={isRefreshingMetadata}
            aria-label="Refresh metadata"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="刷新元数据"
          >
            {isRefreshingMetadata ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={() => setPreviewDialogOpen(true)}
            disabled={isFetchingPreview}
            aria-label="Refresh preview"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="刷新预览图"
          >
            {isFetchingPreview ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Camera className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={handleToggleEdit}
            aria-label="Edit link"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              isEditing
                ? "text-foreground bg-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Edit link"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Analytics panel */}
      {showAnalytics && analyticsStats && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <BreakdownSection
              title="Countries"
              entries={analyticsStats.uniqueCountries.slice(0, 5).map((c) => [c, 0])}
              total={analyticsStats.uniqueCountries.length}
              showCount={false}
            />
            <BreakdownSection
              title="Devices"
              entries={topBreakdownEntries(analyticsStats.deviceBreakdown, 3)}
            />
            <BreakdownSection
              title="Browsers"
              entries={topBreakdownEntries(analyticsStats.browserBreakdown, 3)}
            />
            <BreakdownSection
              title="OS"
              entries={topBreakdownEntries(analyticsStats.osBreakdown, 3)}
            />
          </div>
        </div>
      )}

      {showAnalytics && !analyticsStats && !isLoadingAnalytics && (
        <div className="mt-4 pt-4 border-t border-border text-center text-muted-foreground text-xs">
          暂无分析数据
        </div>
      )}

      {showAnalytics && isLoadingAnalytics && (
        <div className="mt-4 pt-4 border-t border-border text-center text-muted-foreground text-xs">
          加载中...
        </div>
      )}

      {/* Inline edit mode */}
      {isEditing && editCallbacks && (
        <InlineEditArea
          link={link}
          tags={tags}
          linkTags={linkTags}
          folders={folders}
          editCallbacks={editCallbacks}
          isDeleting={isDeleting}
          handleDelete={handleDelete}
          defaultEditing={defaultEditing}
          onCloseEdit={() => setIsEditing(false)}
        />
      )}

      {/* Screenshot source picker dialog */}
      <ScreenshotSourceDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        onSelect={onSelectSource}
        isFetching={isFetchingPreview}
      />
    </div>
  );
});

/** Inline edit area rendered below the card content when edit mode is active */
function InlineEditArea({
  link,
  tags,
  linkTags,
  folders,
  editCallbacks,
  isDeleting,
  handleDelete,
  defaultEditing,
  onCloseEdit,
}: {
  link: Link;
  tags: Tag[];
  linkTags: LinkTag[];
  folders: Folder[];
  editCallbacks: EditLinkCallbacks;
  isDeleting: boolean;
  handleDelete: () => void;
  defaultEditing: boolean;
  onCloseEdit: () => void;
}) {
  const editVm = useInlineLinkEditViewModel(link, tags, linkTags, editCallbacks);

  const handleSave = async () => {
    const success = await editVm.saveEdit();
    // Close edit mode on success (unless defaultEditing — those stay open)
    if (success && !defaultEditing) {
      onCloseEdit();
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border px-0 pb-0 space-y-3" data-testid="edit-area">
      {/* Row 1: URL + Slug */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label htmlFor={`edit-url-${link.id}`} className="text-xs text-muted-foreground">
            目标链接
          </Label>
          <Input
            id={`edit-url-${link.id}`}
            type="url"
            value={editVm.editUrl}
            onChange={(e) => editVm.setEditUrl(e.target.value)}
            placeholder="https://example.com"
            className="h-8 rounded-[8px] border-border bg-background text-xs"
          />
        </div>
        <div className="space-y-1 w-40">
          <Label htmlFor={`edit-slug-${link.id}`} className="text-xs text-muted-foreground">
            短链接
          </Label>
          <Input
            id={`edit-slug-${link.id}`}
            type="text"
            value={editVm.editSlug}
            onChange={(e) => editVm.setEditSlug(e.target.value)}
            placeholder="custom-slug"
            className="h-8 rounded-[8px] border-border bg-background text-xs"
          />
        </div>
      </div>

      {/* Row 2: Folder + Note */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`edit-folder-${link.id}`} className="text-xs text-muted-foreground">
            文件夹
          </Label>
          <select
            id={`edit-folder-${link.id}`}
            value={editVm.editFolderId ?? ""}
            onChange={(e) => editVm.setEditFolderId(e.target.value || undefined)}
            className="flex h-8 w-40 rounded-[8px] border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <option value="">Inbox</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label htmlFor={`edit-note-${link.id}`} className="text-xs text-muted-foreground">
            备注
          </Label>
          <Input
            id={`edit-note-${link.id}`}
            type="text"
            value={editVm.editNote}
            onChange={(e) => editVm.setEditNote(e.target.value)}
            placeholder="添加备注..."
            className="h-8 rounded-[8px] border-border bg-background text-xs"
          />
        </div>
      </div>

      {/* Row 3: Screenshot URL */}
      <div className="space-y-1">
        <Label htmlFor={`edit-screenshot-${link.id}`} className="text-xs text-muted-foreground">
          截图链接
        </Label>
        <Input
          id={`edit-screenshot-${link.id}`}
          type="url"
          value={editVm.editScreenshotUrl}
          onChange={(e) => editVm.setEditScreenshotUrl(e.target.value)}
          placeholder="https://example.com/screenshot.png"
          className="h-8 rounded-[8px] border-border bg-background text-xs"
        />
      </div>

      {/* Tags row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {editVm.assignedTags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} onRemove={editVm.removeTag} />
        ))}
        <TagPicker
          allTags={tags}
          assignedTagIds={editVm.assignedTagIds}
          onSelectTag={editVm.addTag}
          onCreateTag={editVm.createAndAssignTag}
        />
      </div>

      {/* Error message */}
      {editVm.error && (
        <p className="text-xs text-destructive">{editVm.error}</p>
      )}

      {/* Toolbar: Save + Delete */}
      <div className="flex items-center justify-between">
        <DeleteLinkDialog
          trigger={
            <button
              aria-label="Delete link"
              className="flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              disabled={isDeleting}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              {isDeleting ? "删除中..." : "删除"}
            </button>
          }
          isDeleting={isDeleting}
          onConfirm={handleDelete}
        />
        <Button
          size="sm"
          className="h-8 rounded-[8px] text-xs"
          onClick={handleSave}
          disabled={editVm.isSaving}
        >
          {editVm.isSaving ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" strokeWidth={1.5} />
              保存中
            </>
          ) : (
            "保存"
          )}
        </Button>
      </div>
    </div>
  );
}

/** Dialog for choosing screenshot source */
function ScreenshotSourceDialog({
  open,
  onOpenChange,
  onSelect,
  isFetching,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (source: ScreenshotSource) => void;
  isFetching: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>选择截图来源</DialogTitle>
          <DialogDescription>
            选择一个服务来抓取网页预览截图
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button
            variant="outline"
            className="justify-start gap-3 h-auto py-3 px-4"
            onClick={() => onSelect("microlink")}
            disabled={isFetching}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent shrink-0">
              <Camera className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Microlink</p>
              <p className="text-xs text-muted-foreground">通用截图服务，支持大部分网站</p>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-3 h-auto py-3 px-4"
            onClick={() => onSelect("screenshotDomains")}
            disabled={isFetching}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent shrink-0">
              <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">Screenshot Domains</p>
              <p className="text-xs text-muted-foreground">基于域名的截图服务</p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BreakdownSection({
  title,
  entries,
  total,
  showCount = true,
}: {
  title: string;
  entries: [string, number][];
  total?: number;
  showCount?: boolean;
}) {
  return (
    <div>
      <h4 className="text-muted-foreground text-xs uppercase tracking-wide mb-2">
        {title}
      </h4>
      {entries.length > 0 ? (
        <div className="space-y-1">
          {entries.map(([label, count]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-muted-foreground capitalize">{label}</span>
              {showCount && (
                <span className="text-muted-foreground/70">{count}</span>
              )}
            </div>
          ))}
          {total && total > entries.length && (
            <span className="text-muted-foreground/70 text-xs">
              +{total - entries.length} more
            </span>
          )}
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">No data</span>
      )}
    </div>
  );
}
