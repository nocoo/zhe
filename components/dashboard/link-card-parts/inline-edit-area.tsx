"use client";

import { Loader2, Trash2 } from "lucide-react";
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
import { useInlineLinkEditViewModel } from "@/viewmodels/useLinksViewModel";
import {
  DeleteLinkDialog,
  TagBadge,
  TagPicker,
} from "@/components/dashboard/shared-link-components";
import type { Folder, Link, LinkTag, Tag } from "@/models/types";
import type { EditLinkCallbacks } from "@/viewmodels/useLinksViewModel";

const FIELD_INPUT_CLS =
  "h-8 rounded-widget border-border bg-background text-xs";

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
    <div className={`space-y-1 ${className}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

interface EditVm {
  editUrl: string;
  setEditUrl: (v: string) => void;
  editSlug: string;
  setEditSlug: (v: string) => void;
  editFolderId: string | null;
  setEditFolderId: (v: string | null) => void;
  editNote: string;
  setEditNote: (v: string) => void;
  editScreenshotUrl: string;
  setEditScreenshotUrl: (v: string) => void;
}

function UrlSlugRow({ link, vm }: { link: Link; vm: EditVm }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <LabelledField
        id={`edit-url-${link.id}`}
        label="目标链接"
        className="flex-1 min-w-[200px]"
      >
        <Input
          id={`edit-url-${link.id}`}
          type="url"
          value={vm.editUrl}
          onChange={(e) => vm.setEditUrl(e.target.value)}
          placeholder="https://example.com"
          className={FIELD_INPUT_CLS}
        />
      </LabelledField>
      <LabelledField id={`edit-slug-${link.id}`} label="短链接" className="w-40">
        <Input
          id={`edit-slug-${link.id}`}
          type="text"
          value={vm.editSlug}
          onChange={(e) => vm.setEditSlug(e.target.value)}
          placeholder="custom-slug"
          className={FIELD_INPUT_CLS}
        />
      </LabelledField>
    </div>
  );
}

function FolderNoteRow({
  link,
  folders,
  vm,
}: {
  link: Link;
  folders: Folder[];
  vm: EditVm;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <LabelledField id={`edit-folder-${link.id}`} label="文件夹">
        <Select
          value={vm.editFolderId ?? "__inbox__"}
          onValueChange={(v) =>
            vm.setEditFolderId(v === "__inbox__" ? null : v)
          }
        >
          <SelectTrigger
            id={`edit-folder-${link.id}`}
            className="h-8 w-40 rounded-widget border-border bg-background text-xs"
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
      <LabelledField
        id={`edit-note-${link.id}`}
        label="备注"
        className="flex-1 min-w-[200px]"
      >
        <Input
          id={`edit-note-${link.id}`}
          type="text"
          value={vm.editNote}
          onChange={(e) => vm.setEditNote(e.target.value)}
          placeholder="添加备注..."
          className={FIELD_INPUT_CLS}
        />
      </LabelledField>
    </div>
  );
}

function ScreenshotUrlRow({ link, vm }: { link: Link; vm: EditVm }) {
  return (
    <LabelledField id={`edit-screenshot-${link.id}`} label="截图链接">
      <Input
        id={`edit-screenshot-${link.id}`}
        type="url"
        value={vm.editScreenshotUrl}
        onChange={(e) => vm.setEditScreenshotUrl(e.target.value)}
        placeholder="https://example.com/screenshot.png"
        className={FIELD_INPUT_CLS}
      />
    </LabelledField>
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
}: {
  isSaving: boolean;
  isDeleting: boolean;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <DeleteLinkDialog
        trigger={
          <button
            aria-label="Delete link"
            className="flex h-8 items-center gap-1.5 rounded-widget px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            disabled={isDeleting}
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            {isDeleting ? "删除中..." : "删除"}
          </button>
        }
        isDeleting={isDeleting}
        onConfirm={onDelete}
      />
      <Button
        size="sm"
        className="h-8 rounded-widget text-xs"
        onClick={onSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-3 h-3 mr-1 animate-spin" strokeWidth={1.5} />
            保存中
          </>
        ) : (
          "保存"
        )}
      </Button>
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
}: InlineEditAreaProps) {
  const editVm = useInlineLinkEditViewModel(link, tags, linkTags, editCallbacks);

  const handleSave = async () => {
    const success = await editVm.saveEdit();
    if (success && !defaultEditing) onCloseEdit();
  };

  return (
    <div
      className="mt-4 pt-4 border-t border-border px-0 pb-0 space-y-3"
      data-testid="edit-area"
    >
      <UrlSlugRow link={link} vm={editVm} />
      <FolderNoteRow link={link} folders={folders} vm={editVm} />
      <ScreenshotUrlRow link={link} vm={editVm} />

      <TagsRow
        allTags={tags}
        assignedTags={editVm.assignedTags}
        assignedTagIds={editVm.assignedTagIds}
        onAdd={editVm.addTag}
        onRemove={editVm.removeTag}
        onCreate={editVm.createAndAssignTag}
      />

      {editVm.error && <p className="text-xs text-destructive">{editVm.error}</p>}

      <EditToolbar
        isSaving={editVm.isSaving}
        isDeleting={isDeleting}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
