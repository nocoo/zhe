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
  X,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatNumber } from "@/lib/utils";
import { useLinkCardViewModel } from "@/viewmodels/useLinksViewModel";
import { stripProtocol } from "@/models/links";
import { topBreakdownEntries } from "@/models/links";
import type { Link, Folder } from "@/models/types";

interface LinkCardProps {
  link: Link;
  siteUrl: string;
  onDelete: (id: number) => void;
  onUpdate: (link: Link) => void;
  folders?: Folder[];
}

export function LinkCard({ link, siteUrl, onDelete, onUpdate, folders = [] }: LinkCardProps) {
  const {
    shortUrl,
    copied,
    isDeleting,
    showAnalytics,
    analyticsStats,
    isLoadingAnalytics,
    isEditing,
    editUrl,
    setEditUrl,
    editFolderId,
    setEditFolderId,
    isSaving,
    handleCopy,
    handleDelete,
    handleToggleAnalytics,
    startEditing,
    cancelEditing,
    saveEdit,
  } = useLinkCardViewModel(link, siteUrl, onDelete, onUpdate);

  return (
    <div className="rounded-[14px] border-0 bg-secondary shadow-none p-4 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Short URL */}
          <div className="flex items-center gap-2 mb-1">
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

          {/* Original URL */}
          <a
            href={link.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground truncate block"
          >
            {link.originalUrl}
          </a>

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
            onClick={startEditing}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Delete link"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-destructive focus:text-destructive"
              >
                {isDeleting ? "删除中..." : "删除链接"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Inline edit form */}
      {isEditing && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={`edit-url-${link.id}`} className="text-xs text-muted-foreground">
              目标链接
            </label>
            <input
              id={`edit-url-${link.id}`}
              type="url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex h-9 w-full rounded-[10px] border border-border bg-background px-3 py-1 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>
          {folders.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor={`edit-folder-${link.id}`} className="text-xs text-muted-foreground">
                文件夹
              </label>
              <select
                id={`edit-folder-${link.id}`}
                value={editFolderId ?? ""}
                onChange={(e) => setEditFolderId(e.target.value || undefined)}
                className="flex h-9 w-full rounded-[10px] border border-border bg-background px-3 py-1 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="">未分类</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={cancelEditing}
              disabled={isSaving}
              className="flex h-8 items-center gap-1 rounded-[8px] px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              取消
            </button>
            <button
              onClick={saveEdit}
              disabled={isSaving}
              className="flex h-8 items-center gap-1 rounded-[8px] bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                  保存中...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                  保存
                </>
              )}
            </button>
          </div>
        </div>
      )}

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
