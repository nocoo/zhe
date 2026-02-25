"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { TagBadge, TagPicker } from "@/components/dashboard/shared-link-components";
import type { Tag, Folder } from "@/models/types";

interface EditLinkDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editUrl: string;
  setEditUrl: (url: string) => void;
  editSlug: string;
  setEditSlug: (slug: string) => void;
  editFolderId: string | undefined;
  setEditFolderId: (id: string | undefined) => void;
  editNote: string;
  setEditNote: (note: string) => void;
  editScreenshotUrl: string;
  setEditScreenshotUrl: (url: string) => void;
  isSaving: boolean;
  error: string;
  assignedTags: Tag[];
  allTags: Tag[];
  assignedTagIds: Set<string>;
  folders: Folder[];
  onSave: () => void;
  onClose: () => void;
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onCreateAndAssignTag: (name: string) => void;
}

export function EditLinkDialog({
  isOpen,
  onOpenChange,
  editUrl,
  setEditUrl,
  editSlug,
  setEditSlug,
  editFolderId,
  setEditFolderId,
  editNote,
  setEditNote,
  editScreenshotUrl,
  setEditScreenshotUrl,
  isSaving,
  error,
  assignedTags,
  allTags,
  assignedTagIds,
  folders,
  onSave,
  onClose,
  onAddTag,
  onRemoveTag,
  onCreateAndAssignTag,
}: EditLinkDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] rounded-[14px] border-0 bg-card"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            编辑链接
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL input */}
          <div className="space-y-2">
            <Label htmlFor="edit-url" className="text-sm text-foreground">
              目标链接
            </Label>
            <Input
              id="edit-url"
              type="url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder="https://example.com"
              className="rounded-[10px] border-border bg-secondary text-sm placeholder:text-muted-foreground focus-visible:ring-primary"
            />
          </div>

          {/* Slug input */}
          <div className="space-y-2">
            <Label htmlFor="edit-slug" className="text-sm text-foreground">
              短链接
            </Label>
            <Input
              id="edit-slug"
              type="text"
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
              placeholder="custom-slug"
              className="rounded-[10px] border-border bg-secondary text-sm placeholder:text-muted-foreground focus-visible:ring-primary"
            />
          </div>

          {/* Folder selector */}
          {folders.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="edit-folder" className="text-sm text-foreground">
                文件夹
              </Label>
              <select
                id="edit-folder"
                value={editFolderId ?? ""}
                onChange={(e) =>
                  setEditFolderId(e.target.value || undefined)
                }
                className="flex h-9 w-full rounded-[10px] border border-border bg-secondary px-3 py-1 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="">Inbox</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Note input */}
          <div className="space-y-2">
            <Label htmlFor="edit-note" className="text-sm text-foreground">
              备注
            </Label>
            <textarea
              id="edit-note"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="添加备注..."
              rows={3}
              className="flex w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none"
            />
          </div>

          {/* Screenshot URL input */}
          <div className="space-y-2">
            <Label htmlFor="edit-screenshot-url" className="text-sm text-foreground">
              截图链接
            </Label>
            <Input
              id="edit-screenshot-url"
              type="url"
              value={editScreenshotUrl}
              onChange={(e) => setEditScreenshotUrl(e.target.value)}
              placeholder="https://example.com/screenshot.png"
              className="rounded-[10px] border-border bg-secondary text-sm placeholder:text-muted-foreground focus-visible:ring-primary"
            />
          </div>

          {/* Tags section */}
          <div className="space-y-2">
            <Label className="text-sm text-foreground">标签</Label>

            {/* Assigned tags */}
            <div className="flex flex-wrap gap-1.5">
              {assignedTags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} onRemove={onRemoveTag} />
              ))}

              {/* Add tag button + popover */}
              <TagPicker
                allTags={allTags}
                assignedTagIds={assignedTagIds}
                onSelectTag={onAddTag}
                onCreateTag={onCreateAndAssignTag}
                triggerLabel="添加标签"
                popoverWidth="w-64"
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-[10px]"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="rounded-[10px]"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" strokeWidth={1.5} />
                保存中...
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
