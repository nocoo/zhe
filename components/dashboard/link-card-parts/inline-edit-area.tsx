"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import { updateXMediaDimensionsAction } from "@/actions/connector";
import {
  DeleteLinkDialog,
  TagBadge,
  TagPicker,
} from "@/components/dashboard/shared-link-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { XBookmarksContext, XBookmarksUpdateContext } from "@/contexts/x-bookmarks";
import { cn } from "@/lib/utils";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import { getXBookmarkForLink, type XMediaDimensions } from "@/models/x-bookmarks";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";
import { useInlineLinkEditViewModel } from "@/viewmodels/useLinksViewModel";

function LabelledField({
  id,
  label,
  children,
  className = "",
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function TagsRow({
  allTags,
  assignedTags,
  assignedTagIds,
  onAdd,
  onRemove,
  onCreate,
}: {
  allTags: Tag[];
  assignedTags: Tag[];
  assignedTagIds: Set<string>;
  onAdd: (tagId: string) => void;
  onRemove: (tagId: string) => void;
  onCreate: (name: string) => Promise<unknown>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assignedTags.map((tag) => (
        <TagBadge key={tag.id} tag={tag} onRemove={onRemove} />
      ))}
      <TagPicker
        allTags={allTags}
        assignedTagIds={assignedTagIds}
        onSelectTag={onAdd}
        onCreateTag={onCreate}
      />
    </div>
  );
}

function EditToolbar({
  isSaving,
  isDeleting,
  onSave,
  onDelete,
  onClose,
}: {
  isSaving: boolean;
  isDeleting: boolean;
  onSave: () => void;
  onDelete: () => void;
  onClose?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
      <DeleteLinkDialog
        trigger={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Delete link"
            className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            disabled={isDeleting || isSaving}
          >
            <Trash2 strokeWidth={1.5} aria-hidden />
            {isDeleting ? "删除中..." : "删除"}
          </Button>
        }
        isDeleting={isDeleting}
        onConfirm={onDelete}
      />
      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose} disabled={isSaving || isDeleting}>
            收起
          </Button>
        )}
        <Button size="sm" onClick={onSave} loading={isSaving} disabled={isDeleting}>
          {isSaving ? "保存中" : "保存"}
        </Button>
      </div>
    </div>
  );
}

export interface InlineEditAreaProps {
  link: Link;
  tags: Tag[];
  linkTags: LinkTag[];
  folders: Folder[];
  editCallbacks: EditLinkCallbacks;
  isDeleting: boolean;
  handleDelete: () => void;
  defaultEditing: boolean;
  onCloseEdit: () => void;
  className?: string | undefined;
}

/** Inline edit area rendered below the card content when edit mode is active. */
export function InlineEditArea({
  link,
  tags,
  linkTags,
  folders,
  editCallbacks,
  isDeleting,
  handleDelete,
  defaultEditing,
  onCloseEdit,
  className,
}: InlineEditAreaProps) {
  const editVm = useInlineLinkEditViewModel(link, tags, linkTags, editCallbacks);
  const bookmarks = useContext(XBookmarksContext);
  const setBookmarks = useContext(XBookmarksUpdateContext);
  const bookmark = getXBookmarkForLink(link, bookmarks.get(link.id));
  const [mediaRatios, setMediaRatios] = useState<Record<string, string>>({});
  const [savingMedia, setSavingMedia] = useState(false);
  const [mediaError, setMediaError] = useState("");

  const handleSave = async () => {
    if (savingMedia || editVm.isSaving) return;
    setMediaError("");
    const dimensions: XMediaDimensions[] = [];
    for (const [id, ratio] of Object.entries(mediaRatios)) {
      const match = /^(\d{1,5})\s*[:/]\s*(\d{1,5})$/.exec(ratio.trim());
      const width = Number(match?.[1]);
      const height = Number(match?.[2]);
      if (!width || !height || width > 65535 || height > 65535) {
        setMediaError("请输入有效的宽高比，如 16:9 或 9:16");
        return;
      }
      dimensions.push({ id, width, height });
    }
    setSavingMedia(true);
    try {
      if (!(await editVm.saveEdit())) return;
      if (dimensions.length) {
        const result = await updateXMediaDimensionsAction(link.id, dimensions);
        const updatedAt = result.updatedAt;
        if (!result.success || updatedAt === undefined) {
          setMediaError("媒体比例未保存，请稍后重试");
          return;
        }
        setBookmarks((current) => {
          const saved = current.get(link.id);
          if (
            !saved?.tweet ||
            saved.tweet.id !== bookmark?.tweet?.id ||
            saved.updatedAt > updatedAt
          )
            return current;
          const next = new Map(current);
          next.set(link.id, {
            ...saved,
            updatedAt,
            tweet: {
              ...saved.tweet,
              media: saved.tweet.media.map((media) => ({
                ...media,
                ...dimensions.find((item) => item.id === media.id),
              })),
            },
          });
          return next;
        });
      }
      if (!defaultEditing) onCloseEdit();
    } catch {
      setMediaError("保存失败，请重试");
    } finally {
      setSavingMedia(false);
    }
  };

  return (
    <section
      className={cn(
        "@container/edit space-y-4 border-t border-border/60 bg-background/30 p-4",
        className,
      )}
      aria-label="编辑收藏"
      data-testid="edit-area"
    >
      <h3 className="flex items-center gap-2 text-xs font-semibold">
        <Pencil className="size-3.5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        编辑收藏
      </h3>
      <div className="grid grid-cols-1 gap-3 @xs/edit:grid-cols-2">
        <LabelledField id={`edit-url-${link.id}`} label="目标链接" className="@xs/edit:col-span-2">
          <Input
            id={`edit-url-${link.id}`}
            size="sm"
            type="url"
            value={editVm.editUrl}
            onChange={(e) => editVm.setEditUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </LabelledField>
        <LabelledField id={`edit-slug-${link.id}`} label="短链接">
          <Input
            id={`edit-slug-${link.id}`}
            size="sm"
            type="text"
            value={editVm.editSlug}
            onChange={(e) => editVm.setEditSlug(e.target.value)}
            placeholder="custom-slug"
          />
        </LabelledField>
        <LabelledField id={`edit-folder-${link.id}`} label="文件夹">
          <Select
            value={editVm.editFolderId ?? "__inbox__"}
            onValueChange={(v) => editVm.setEditFolderId(v === "__inbox__" ? null : v)}
          >
            <SelectTrigger
              id={`edit-folder-${link.id}`}
              size="sm"
              className="w-full min-w-0 gap-2 text-left [&>span]:truncate [&>svg]:shrink-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inbox__">Inbox</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabelledField>
        <LabelledField id={`edit-note-${link.id}`} label="备注" className="@xs/edit:col-span-2">
          <Input
            id={`edit-note-${link.id}`}
            size="sm"
            type="text"
            value={editVm.editNote}
            onChange={(e) => editVm.setEditNote(e.target.value)}
            placeholder="添加备注..."
          />
        </LabelledField>
        <LabelledField
          id={`edit-screenshot-${link.id}`}
          label="截图链接"
          className="@xs/edit:col-span-2"
        >
          <Input
            id={`edit-screenshot-${link.id}`}
            size="sm"
            type="url"
            value={editVm.editScreenshotUrl}
            onChange={(e) => editVm.setEditScreenshotUrl(e.target.value)}
            placeholder="https://example.com/screenshot.png"
          />
        </LabelledField>
      </div>

      {!!bookmark?.tweet?.media.length && (
        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-1 text-xs font-medium">媒体比例</legend>
          <p className="text-xs leading-5 text-muted-foreground">
            横屏 16:9，竖屏 9:16；也可填写实际宽高。
          </p>
          {bookmark.tweet.media.map((media, index) => (
            <LabelledField
              key={media.id}
              id={`edit-media-${link.id}-${media.id}`}
              label={`${media.type === "PHOTO" ? "图片" : "视频"} ${index + 1} 宽高比`}
            >
              <Input
                id={`edit-media-${link.id}-${media.id}`}
                size="sm"
                value={
                  mediaRatios[media.id] ??
                  (media.width && media.height ? `${media.width}:${media.height}` : "16:9")
                }
                placeholder="16:9"
                maxLength={15}
                disabled={savingMedia || editVm.isSaving}
                onChange={(event) =>
                  setMediaRatios((current) => ({ ...current, [media.id]: event.target.value }))
                }
              />
            </LabelledField>
          ))}
        </fieldset>
      )}

      <TagsRow
        allTags={tags}
        assignedTags={editVm.assignedTags}
        assignedTagIds={editVm.assignedTagIds}
        onAdd={editVm.addTag}
        onRemove={editVm.removeTag}
        onCreate={editVm.createAndAssignTag}
      />

      {(mediaError || editVm.error) && (
        <p role="alert" className="text-xs text-destructive">
          {mediaError || editVm.error}
        </p>
      )}

      <EditToolbar
        isSaving={editVm.isSaving || savingMedia}
        isDeleting={isDeleting}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={defaultEditing ? undefined : onCloseEdit}
      />
    </section>
  );
}
