"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import {
  Check,
  Copy,
  ExternalLink,
  Inbox as InboxIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command";
import { useDashboardService } from "@/contexts/dashboard-service";
import { useInboxViewModel } from "@/viewmodels/useInboxViewModel";
import { getTagColorClasses } from "@/models/tags";
import { copyToClipboard } from "@/lib/utils";
import { deleteLink } from "@/actions/links";
import type { Link, Tag } from "@/models/types";

/** A single inbox item row with inline triage controls */
function InboxItem({
  link,
  draft,
  folders,
  allTags,
  assignedTags,
  assignedTagIds,
  onSetFolderId,
  onSetNote,
  onSetScreenshotUrl,
  onSave,
  onAddTag,
  onRemoveTag,
  onCreateAndAssignTag,
  onDelete,
}: {
  link: Link;
  draft: { folderId: string | undefined; note: string; screenshotUrl: string; isSaving: boolean; error: string };
  folders: { id: string; name: string }[];
  allTags: Tag[];
  assignedTags: Tag[];
  assignedTagIds: Set<string>;
  onSetFolderId: (folderId: string | undefined) => void;
  onSetNote: (note: string) => void;
  onSetScreenshotUrl: (url: string) => void;
  onSave: () => void;
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onCreateAndAssignTag: (name: string) => void;
  onDelete: () => void;
}) {
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const unassignedTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  const handleCopyOriginalUrl = async () => {
    const success = await copyToClipboard(link.originalUrl);
    if (success) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleSelectTag = (tagId: string) => {
    onAddTag(tagId);
    setTagSearch("");
    setTagPickerOpen(false);
  };

  const handleCreateTag = () => {
    const trimmed = tagSearch.trim();
    if (!trimmed) return;
    onCreateAndAssignTag(trimmed);
    setTagSearch("");
    setTagPickerOpen(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteLink(link.id);
    if (result.success) {
      onDelete();
    } else {
      alert(result.error || "Failed to delete link");
    }
    setIsDeleting(false);
  };

  const displayTitle = link.metaTitle || link.originalUrl;

  return (
    <div className="rounded-[14px] bg-secondary p-4 space-y-3">
      {/* Top row: link info + actions */}
      <div className="flex items-start gap-3">
        {/* Favicon + title + copy button */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
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
              href={link.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:underline truncate"
            >
              {displayTitle}
            </a>
            <button
              onClick={handleCopyOriginalUrl}
              aria-label="Copy original URL"
              className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Copy original URL"
            >
              {copiedUrl ? (
                <Check className="w-3 h-3 text-success" strokeWidth={1.5} />
              ) : (
                <Copy className="w-3 h-3" strokeWidth={1.5} />
              )}
            </button>
          </div>
          {link.metaDescription && (
            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
              {link.metaDescription}
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <a
            href={link.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="打开链接"
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

      {/* Triage controls row */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Folder selector */}
        <div className="space-y-1">
          <label htmlFor={`folder-${link.id}`} className="text-xs text-muted-foreground">
            文件夹
          </label>
          <select
            id={`folder-${link.id}`}
            value={draft.folderId ?? ""}
            onChange={(e) => onSetFolderId(e.target.value || undefined)}
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

        {/* Note input */}
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label htmlFor={`note-${link.id}`} className="text-xs text-muted-foreground">
            备注
          </label>
          <input
            id={`note-${link.id}`}
            type="text"
            value={draft.note}
            onChange={(e) => onSetNote(e.target.value)}
            placeholder="添加备注..."
            className="flex h-8 w-full rounded-[8px] border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>

        {/* Screenshot URL input */}
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label htmlFor={`screenshot-url-${link.id}`} className="text-xs text-muted-foreground">
            截图链接
          </label>
          <input
            id={`screenshot-url-${link.id}`}
            type="url"
            value={draft.screenshotUrl}
            onChange={(e) => onSetScreenshotUrl(e.target.value)}
            placeholder="https://..."
            className="flex h-8 w-full rounded-[8px] border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>

        {/* Save button */}
        <Button
          size="sm"
          className="h-8 rounded-[8px] text-xs"
          onClick={onSave}
          disabled={draft.isSaving}
        >
          {draft.isSaving ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" strokeWidth={1.5} />
              保存中
            </>
          ) : (
            "保存"
          )}
        </Button>
      </div>

      {/* Tags row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {assignedTags.map((tag) => {
          const colors = getTagColorClasses(tag.color);
          return (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${colors.badge}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
              {tag.name}
              <button
                type="button"
                onClick={() => onRemoveTag(tag.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                aria-label={`Remove tag ${tag.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          );
        })}

        {/* Add tag popover */}
        <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              aria-label="Add tag"
            >
              <Plus className="h-3 w-3" />
              标签
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="搜索或创建标签..."
                value={tagSearch}
                onValueChange={setTagSearch}
              />
              <CommandList>
                <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
                  未找到标签
                </CommandEmpty>
                <CommandGroup>
                  {unassignedTags
                    .filter((t) =>
                      t.name.toLowerCase().includes(tagSearch.toLowerCase()),
                    )
                    .map((tag) => {
                      const colors = getTagColorClasses(tag.color);
                      return (
                        <CommandItem
                          key={tag.id}
                          value={tag.id}
                          onSelect={() => handleSelectTag(tag.id)}
                          className="flex items-center gap-2"
                        >
                          <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                          <span>{tag.name}</span>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
                {tagSearch.trim() &&
                  !allTags.some(
                    (t) => t.name.toLowerCase() === tagSearch.trim().toLowerCase(),
                  ) && (
                    <CommandGroup>
                      <CommandItem
                        onSelect={handleCreateTag}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>创建 &ldquo;{tagSearch.trim()}&rdquo;</span>
                      </CommandItem>
                    </CommandGroup>
                  )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Error message */}
      {draft.error && (
        <p className="text-xs text-destructive">{draft.error}</p>
      )}
    </div>
  );
}

/** Inbox triage view — shows uncategorized links with inline editing controls */
export function InboxTriage() {
  const {
    links,
    folders,
    tags,
    linkTags,
    loading,
    refreshLinks,
    handleLinkUpdated,
    handleLinkDeleted,
    handleTagCreated,
    handleLinkTagAdded,
    handleLinkTagRemoved,
  } = useDashboardService();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshLinks();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshLinks]);

  const callbacks = {
    onLinkUpdated: handleLinkUpdated,
    onTagCreated: handleTagCreated,
    onLinkTagAdded: handleLinkTagAdded,
    onLinkTagRemoved: handleLinkTagRemoved,
  };

  const vm = useInboxViewModel(links, folders, tags, linkTags, callbacks);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="animate-pulse">
            <div className="h-6 w-24 rounded bg-muted" />
            <div className="h-4 w-16 rounded bg-muted mt-1.5" />
          </div>
        </div>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[14px] bg-secondary p-4 space-y-3">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
              <div className="flex gap-3">
                <div className="h-8 w-40 rounded bg-muted" />
                <div className="h-8 flex-1 rounded bg-muted" />
                <div className="h-8 w-16 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Inbox</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            共 {vm.inboxLinks.length} 条待整理链接
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-[10px]"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="刷新链接"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
          刷新
        </Button>
      </div>

      {/* Content */}
      {vm.inboxLinks.length === 0 ? (
        <div className="rounded-[14px] border-0 bg-secondary shadow-none p-12 text-center">
          <InboxIcon
            className="w-10 h-10 mx-auto text-muted-foreground mb-4"
            strokeWidth={1.5}
          />
          <p className="text-sm text-muted-foreground mb-2">Inbox 已清空</p>
          <p className="text-xs text-muted-foreground">
            所有链接都已整理到文件夹中
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {vm.inboxLinks.map((link) => {
            const draft = vm.getDraft(link.id);
            const assignedTagIds = vm.getAssignedTagIds(link.id);
            const assignedTags = vm.getAssignedTags(link.id);

            return (
              <InboxItem
                key={link.id}
                link={link}
                draft={draft}
                folders={vm.folders}
                allTags={vm.allTags}
                assignedTags={assignedTags}
                assignedTagIds={assignedTagIds}
                onSetFolderId={(fId) => vm.setDraftFolderId(link.id, fId)}
                onSetNote={(note) => vm.setDraftNote(link.id, note)}
                onSetScreenshotUrl={(url) => vm.setDraftScreenshotUrl(link.id, url)}
                onSave={() => vm.saveItem(link.id)}
                onAddTag={(tagId) => vm.addTag(link.id, tagId)}
                onRemoveTag={(tagId) => vm.removeTag(link.id, tagId)}
                onCreateAndAssignTag={(name) => vm.createAndAssignTag(link.id, name)}
                onDelete={() => handleLinkDeleted(link.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
