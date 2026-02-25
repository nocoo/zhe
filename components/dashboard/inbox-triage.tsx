"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import {
  ExternalLink,
  Inbox as InboxIcon,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardService } from "@/contexts/dashboard-service";
import { useInboxViewModel } from "@/viewmodels/useInboxViewModel";
import { deleteLink } from "@/actions/links";
import { DeleteLinkDialog, TagBadge, TagPicker, CopyUrlButton } from "@/components/dashboard/shared-link-components";
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
  const [isDeleting, setIsDeleting] = useState(false);

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
            <CopyUrlButton url={link.originalUrl} className="h-5 w-5" />
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
          <DeleteLinkDialog
            trigger={
              <button
                aria-label="Delete link"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            }
            isDeleting={isDeleting}
            onConfirm={handleDelete}
          />
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
        {assignedTags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} onRemove={onRemoveTag} />
        ))}

        <TagPicker
          allTags={allTags}
          assignedTagIds={assignedTagIds}
          onSelectTag={onAddTag}
          onCreateTag={onCreateAndAssignTag}
        />
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
