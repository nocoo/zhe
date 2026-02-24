"use client";

import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
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
import { getTagColorClassesByName } from "@/models/tags";
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
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  const unassignedTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  const handleCreateTag = () => {
    const trimmed = tagSearch.trim();
    if (!trimmed) return;
    onCreateAndAssignTag(trimmed);
    setTagSearch("");
    setTagPickerOpen(false);
  };

  const handleSelectTag = (tagId: string) => {
    onAddTag(tagId);
    setTagSearch("");
    setTagPickerOpen(false);
  };

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
              {assignedTags.map((tag) => {
                const colors = getTagColorClassesByName(tag.name);
                return (
                  <span
                    key={tag.id}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.badge}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${colors.dot}`}
                    />
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => onRemoveTag(tag.id)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      aria-label={`Remove tag ${tag.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}

              {/* Add tag button + popover */}
              <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                    aria-label="Add tag"
                  >
                    <Plus className="h-3 w-3" />
                    添加标签
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
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
                      {/* Existing unassigned tags filtered by search */}
                      <CommandGroup>
                        {unassignedTags
                          .filter((t) =>
                            t.name
                              .toLowerCase()
                              .includes(tagSearch.toLowerCase()),
                          )
                          .map((tag) => {
                            const colors = getTagColorClassesByName(tag.name);
                            return (
                              <CommandItem
                                key={tag.id}
                                value={tag.id}
                                onSelect={() => handleSelectTag(tag.id)}
                                className="flex items-center gap-2"
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${colors.dot}`}
                                />
                                <span>{tag.name}</span>
                                {assignedTagIds.has(tag.id) && (
                                  <Check className="ml-auto h-3.5 w-3.5" />
                                )}
                              </CommandItem>
                            );
                          })}
                      </CommandGroup>

                      {/* Create new tag option */}
                      {tagSearch.trim() &&
                        !allTags.some(
                          (t) =>
                            t.name.toLowerCase() ===
                            tagSearch.trim().toLowerCase(),
                        ) && (
                          <CommandGroup>
                            <CommandItem
                              onSelect={handleCreateTag}
                              className="flex items-center gap-2"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>
                                创建 &ldquo;{tagSearch.trim()}&rdquo;
                              </span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
