"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Inbox as InboxIcon,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkCard } from "@/components/dashboard/link-card";
import { EditLinkDialog } from "@/components/dashboard/edit-link-dialog";
import { TagBadge, TagPicker } from "@/components/dashboard/shared-link-components";
import { useDashboardService } from "@/contexts/dashboard-service";
import { useInboxViewModel } from "@/viewmodels/useInboxViewModel";
import { useEditLinkViewModel } from "@/viewmodels/useLinksViewModel";
import type { Link } from "@/models/types";

/** Inbox triage view — shows uncategorized links with inline editing controls */
export function InboxTriage() {
  const {
    links,
    folders,
    tags,
    linkTags,
    loading,
    refreshLinks,
    siteUrl,
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

  const callbacks = useMemo(() => ({
    onLinkUpdated: handleLinkUpdated,
    onTagCreated: handleTagCreated,
    onLinkTagAdded: handleLinkTagAdded,
    onLinkTagRemoved: handleLinkTagRemoved,
  }), [handleLinkUpdated, handleTagCreated, handleLinkTagAdded, handleLinkTagRemoved]);

  const vm = useInboxViewModel(links, folders, tags, linkTags, callbacks);

  // Singleton edit dialog — shared across all LinkCards (same pattern as links-list.tsx)
  const editVm = useEditLinkViewModel(null, tags, linkTags, callbacks);
  const { openDialog } = editVm;

  const handleEdit = useCallback((link: Link) => {
    openDialog(link);
  }, [openDialog]);

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
        <div className="space-y-2">
          {vm.inboxLinks.map((link) => {
            const draft = vm.getDraft(link.id);
            const assignedTagIds = vm.getAssignedTagIds(link.id);
            const assignedTags = vm.getAssignedTags(link.id);

            return (
              <LinkCard
                key={link.id}
                link={link}
                siteUrl={siteUrl}
                onDelete={handleLinkDeleted}
                onUpdate={handleLinkUpdated}
                onEdit={handleEdit}
                viewMode="list"
                tags={tags}
                linkTags={linkTags}
              >
                {/* Triage controls — layered on top of LinkCard */}
                <div className="px-4 pb-4 space-y-3">
                  {/* Triage controls row */}
                  <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border">
                    {/* Folder selector */}
                    <div className="space-y-1">
                      <label htmlFor={`folder-${link.id}`} className="text-xs text-muted-foreground">
                        文件夹
                      </label>
                      <select
                        id={`folder-${link.id}`}
                        value={draft.folderId ?? ""}
                        onChange={(e) => vm.setDraftFolderId(link.id, e.target.value || undefined)}
                        className="flex h-8 w-40 rounded-[8px] border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      >
                        <option value="">Inbox</option>
                        {vm.folders.map((folder) => (
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
                        onChange={(e) => vm.setDraftNote(link.id, e.target.value)}
                        placeholder="添加备注..."
                        className="flex h-8 w-full rounded-[8px] border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      />
                    </div>

                    {/* Save button */}
                    <Button
                      size="sm"
                      className="h-8 rounded-[8px] text-xs"
                      onClick={() => vm.saveItem(link.id)}
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
                      <TagBadge key={tag.id} tag={tag} onRemove={(tagId) => vm.removeTag(link.id, tagId)} />
                    ))}

                    <TagPicker
                      allTags={vm.allTags}
                      assignedTagIds={assignedTagIds}
                      onSelectTag={(tagId) => vm.addTag(link.id, tagId)}
                      onCreateTag={(name) => vm.createAndAssignTag(link.id, name)}
                    />
                  </div>

                  {/* Error message */}
                  {draft.error && (
                    <p className="text-xs text-destructive">{draft.error}</p>
                  )}
                </div>
              </LinkCard>
            );
          })}
        </div>
      )}

      {/* Singleton edit dialog — shared across all cards */}
      <EditLinkDialog
        isOpen={editVm.isOpen}
        onOpenChange={(open) => { if (!open) editVm.closeDialog(); }}
        editUrl={editVm.editUrl}
        setEditUrl={editVm.setEditUrl}
        editSlug={editVm.editSlug}
        setEditSlug={editVm.setEditSlug}
        editFolderId={editVm.editFolderId}
        setEditFolderId={editVm.setEditFolderId}
        editNote={editVm.editNote}
        setEditNote={editVm.setEditNote}
        editScreenshotUrl={editVm.editScreenshotUrl}
        setEditScreenshotUrl={editVm.setEditScreenshotUrl}
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
