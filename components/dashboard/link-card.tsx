"use client";

import {
  Copy,
  ExternalLink,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Pencil,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { EditLinkDialog } from "./edit-link-dialog";
import { formatDate, formatNumber } from "@/lib/utils";
import { useLinkCardViewModel, useEditLinkViewModel } from "@/viewmodels/useLinksViewModel";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { stripProtocol } from "@/models/links";
import { topBreakdownEntries } from "@/models/links";
import { getTagColorClasses } from "@/models/tags";
import type { Link, Folder, Tag, LinkTag } from "@/models/types";

type ViewMode = "list" | "grid";

interface LinkCardProps {
  link: Link;
  siteUrl: string;
  onDelete: (id: number) => void;
  onUpdate: (link: Link) => void;
  folders?: Folder[];
  viewMode?: ViewMode;
  tags?: Tag[];
  linkTags?: LinkTag[];
  editCallbacks?: EditLinkCallbacks;
}

const defaultEditCallbacks: EditLinkCallbacks = {
  onLinkUpdated: () => {},
  onTagCreated: () => {},
  onLinkTagAdded: () => {},
  onLinkTagRemoved: () => {},
};

export function LinkCard({ link, siteUrl, onDelete, onUpdate, folders = [], viewMode = "list", tags = [], linkTags = [], editCallbacks = defaultEditCallbacks }: LinkCardProps) {
  const {
    shortUrl,
    copied,
    isDeleting,
    showAnalytics,
    analyticsStats,
    isLoadingAnalytics,
    handleCopy,
    handleDelete,
    handleToggleAnalytics,
    handleRefreshMetadata,
    isRefreshingMetadata,
    screenshotUrl,
    isLoadingScreenshot,
  } = useLinkCardViewModel(link, siteUrl, onDelete, onUpdate);

  const editVm = useEditLinkViewModel(link, tags, linkTags, editCallbacks);

  // Tags assigned to this specific link
  const cardTags = tags.filter((t) => editVm.assignedTagIds.has(t.id));

  if (viewMode === "grid") {
    return (
      <div className="group rounded-[14px] border-0 bg-secondary shadow-none overflow-hidden transition-colors">
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
          ) : isLoadingScreenshot ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" strokeWidth={1.5} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <ExternalLink className="w-5 h-5 text-muted-foreground/50" strokeWidth={1.5} />
            </div>
          )}

          {/* Hover action overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              aria-label="Copy link"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              title="Copy link"
            >
              {copied ? (
                <Check className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <Copy className="w-4 h-4" strokeWidth={1.5} />
              )}
            </button>
            <a
              href={link.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              title="Open link"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
            </a>
            <button
              onClick={(e) => { e.stopPropagation(); editVm.openDialog(link); }}
              aria-label="Edit link"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              title="Edit link"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Delete link"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除</AlertDialogTitle>
                  <AlertDialogDescription>
                    此操作不可撤销，确定要删除这条链接吗？
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? "删除中..." : "删除"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Compact info */}
        <div className="p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            {link.metaFavicon && (
              <Image
                src={link.metaFavicon}
                alt="favicon"
                width={14}
                height={14}
                className="w-3.5 h-3.5 shrink-0 rounded-sm"
                unoptimized
              />
            )}
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:underline truncate"
            >
              {stripProtocol(shortUrl)}
            </a>
          </div>
          {link.metaTitle && (
            <p className="text-xs text-foreground/80 truncate">
              {link.metaTitle}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3" strokeWidth={1.5} />
              {formatNumber(link.clicks ?? 0)}
            </span>
            <span>{formatDate(link.createdAt)}</span>
          </div>
          {/* Tag badges in grid mode */}
          {cardTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {cardTags.map((tag) => {
                const colors = getTagColorClasses(tag.color);
                return (
                  <span
                    key={tag.id}
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-medium ${colors.badge}`}
                  >
                    <span className={`h-1 w-1 rounded-full ${colors.dot}`} />
                    {tag.name}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Edit dialog (shared for grid mode) */}
        <EditLinkDialog
          isOpen={editVm.isOpen}
          onOpenChange={(open) => { if (!open) editVm.closeDialog(); }}
          editUrl={editVm.editUrl}
          setEditUrl={editVm.setEditUrl}
          editFolderId={editVm.editFolderId}
          setEditFolderId={editVm.setEditFolderId}
          editNote={editVm.editNote}
          setEditNote={editVm.setEditNote}
          isSaving={editVm.isSaving}
          error={editVm.error}
          assignedTags={editVm.assignedTags}
          allTags={tags}
          assignedTagIds={editVm.assignedTagIds}
          folders={folders}
          onSave={editVm.saveEdit}
          onClose={editVm.closeDialog}
          onAddTag={editVm.addTag}
          onRemoveTag={editVm.removeTag}
          onCreateAndAssignTag={editVm.createAndAssignTag}
        />
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border-0 bg-secondary shadow-none p-4 transition-colors">
      <div className="flex items-stretch gap-4">
        {/* Screenshot thumbnail — left side, fills container height */}
        {screenshotUrl && (
          <a
            href={link.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 hidden sm:block self-stretch"
          >
            <Image
              src={screenshotUrl}
              alt="Screenshot"
              width={120}
              height={90}
              className="w-[120px] h-full rounded-md object-cover border border-border/50 aspect-[4/3]"
              unoptimized
            />
          </a>
        )}
        {isLoadingScreenshot && (
          <div className="shrink-0 hidden sm:flex w-[120px] self-stretch rounded-md border border-border/50 bg-accent items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" strokeWidth={1.5} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Short URL */}
          <div className="flex items-center gap-2 mb-1">
            {link.metaFavicon && (
              <Image
                src={link.metaFavicon}
                alt="favicon"
                width={16}
                height={16}
                className="w-4 h-4 shrink-0 rounded-sm"
                unoptimized
              />
            )}
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:underline truncate"
            >
              {stripProtocol(shortUrl)}
            </a>
            {link.isCustom && (
              <Badge
                variant="secondary"
                className="shrink-0 text-[11px] bg-accent"
              >
                custom
              </Badge>
            )}
          </div>

          {/* Meta title */}
          {link.metaTitle && (
            <p className="text-xs text-foreground/80 truncate mb-0.5">
              {link.metaTitle}
            </p>
          )}

          {/* Original URL */}
          <a
            href={link.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground truncate block"
          >
            {link.originalUrl}
          </a>

          {/* Meta description */}
          {link.metaDescription && (
            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
              {link.metaDescription}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
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
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleRefreshMetadata}
            disabled={isRefreshingMetadata}
            aria-label="Refresh metadata"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh metadata"
          >
            {isRefreshingMetadata ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={handleCopy}
            aria-label="Copy link"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Copy link"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" strokeWidth={1.5} />
            ) : (
              <Copy className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={() => editVm.openDialog(link)}
            aria-label="Edit link"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit link"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <a
            href={link.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Open link"
          >
            <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
          </a>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                aria-label="Delete link"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除</AlertDialogTitle>
                <AlertDialogDescription>
                  此操作不可撤销，确定要删除这条链接吗？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "删除中..." : "删除"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Tag badges */}
      {cardTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border">
          {cardTags.map((tag) => {
            const colors = getTagColorClasses(tag.color);
            return (
              <span
                key={tag.id}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${colors.badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                {tag.name}
              </span>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <EditLinkDialog
        isOpen={editVm.isOpen}
        onOpenChange={(open) => { if (!open) editVm.closeDialog(); }}
        editUrl={editVm.editUrl}
        setEditUrl={editVm.setEditUrl}
        editFolderId={editVm.editFolderId}
        setEditFolderId={editVm.setEditFolderId}
        editNote={editVm.editNote}
        setEditNote={editVm.setEditNote}
        isSaving={editVm.isSaving}
        error={editVm.error}
        assignedTags={editVm.assignedTags}
        allTags={tags}
        assignedTagIds={editVm.assignedTagIds}
        folders={folders}
        onSave={editVm.saveEdit}
        onClose={editVm.closeDialog}
        onAddTag={editVm.addTag}
        onRemoveTag={editVm.removeTag}
        onCreateAndAssignTag={editVm.createAndAssignTag}
      />

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
    </div>
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
