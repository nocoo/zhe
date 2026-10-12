"use client";

import { Pencil } from "lucide-react";
import { useContext, useState } from "react";
import { updateXMediaDimensionsAction } from "@/actions/connector";
import { BookmarkActionButton } from "@/components/dashboard/bookmark-actions";
import { TagBadge, TagPicker } from "@/components/dashboard/shared-link-components";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
      <Label htmlFor={id} className="block text-xs font-medium leading-4">
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

export interface InlineEditAreaProps {
  link: Link;
  tags: Tag[];
  linkTags: LinkTag[];
  folders: Folder[];
  editCallbacks: EditLinkCallbacks;
  onCloseEdit: () => void;
  onSaved?: () => void;
  className?: string | undefined;
}

/** Shared edit form for the card editing dialog. */
export function InlineEditArea({
  link,
  tags,
  linkTags,
  folders,
  editCallbacks,
  onCloseEdit,
  onSaved,
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
    if (savingMedia || editVm.isSaving || editVm.isDeletingScreenshot) return;
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
      (onSaved ?? onCloseEdit)();
    } catch {
      setMediaError("保存失败，请重试");
    } finally {
      setSavingMedia(false);
    }
  };

  return (
    <section
      className={cn("@container/edit space-y-4 border-0 bg-transparent p-5 sm:p-6", className)}
      aria-label="编辑收藏"
      aria-busy={editVm.isSaving || savingMedia || editVm.isDeletingScreenshot}
      data-testid="edit-area"
    >
      <DialogTitle className="flex items-center gap-2">
        <Pencil className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        编辑收藏
      </DialogTitle>
      <p className="text-xs text-muted-foreground">
        收藏于 {new Date(link.createdAt).toLocaleString("zh-CN")}
      </p>
      <div className="grid grid-cols-1 gap-3 @xs/edit:grid-cols-2">
        <LabelledField id={`edit-url-${link.id}`} label="目标链接" className="@xs/edit:col-span-2">
          <Input
            id={`edit-url-${link.id}`}
            size="default"
            type="url"
            value={editVm.editUrl}
            onChange={(e) => editVm.setEditUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </LabelledField>
        <LabelledField id={`edit-slug-${link.id}`} label="短链接">
          <Input
            id={`edit-slug-${link.id}`}
            size="default"
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
              size="default"
              className="w-full min-w-0 gap-2 text-left [&>span]:truncate [&>svg]:shrink-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inbox__">未分类</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabelledField>
        <LabelledField id={`edit-title-${link.id}`} label="标题" className="@xs/edit:col-span-2">
          <Input
            id={`edit-title-${link.id}`}
            size="default"
            value={editVm.editTitle}
            onChange={(e) => editVm.setEditTitle(e.target.value)}
            placeholder="标题（可选）"
          />
        </LabelledField>
        <LabelledField id={`edit-note-${link.id}`} label="备注" className="@xs/edit:col-span-2">
          <Textarea
            id={`edit-note-${link.id}`}
            rows={3}
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
            size="default"
            type="url"
            value={editVm.editScreenshotUrl}
            onChange={(e) => editVm.setEditScreenshotUrl(e.target.value)}
            placeholder="https://example.com/screenshot.png"
          />
          {editVm.screenshotAction && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BookmarkActionButton
                action={{
                  ...editVm.screenshotAction,
                  disabled: editVm.screenshotAction.disabled || savingMedia,
                }}
              />
              <span>删除已保存截图</span>
            </div>
          )}
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
                size="default"
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

      <div className="space-y-1.5">
        <p className="text-xs font-medium leading-4">标签</p>
        <TagsRow
          allTags={tags}
          assignedTags={editVm.assignedTags}
          assignedTagIds={editVm.assignedTagIds}
          onAdd={editVm.addTag}
          onRemove={editVm.removeTag}
          onCreate={editVm.createAndAssignTag}
        />
      </div>

      {(mediaError || editVm.error) && (
        <p role="alert" className="text-xs text-destructive">
          {mediaError || editVm.error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
        <Button
          size="lg"
          variant="ghost"
          onClick={onCloseEdit}
          disabled={editVm.isSaving || savingMedia || editVm.isDeletingScreenshot}
        >
          收起
        </Button>
        <Button
          size="lg"
          onClick={handleSave}
          loading={editVm.isSaving || savingMedia}
          disabled={editVm.isDeletingScreenshot}
        >
          保存
        </Button>
      </div>
    </section>
  );
}
