"use client";

import { Loader2, Plus } from "lucide-react";
import { useCallback } from "react";
import { createTag } from "@/actions/tags";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Folder, Link, Tag } from "@/models/types";
import { useCreateLinkViewModel } from "@/viewmodels/useLinksViewModel";
import { FolderSelect, ModeTabs, SlugInput, TagsField } from "./create-link-modal-parts/fields";

interface CreateLinkModalProps {
  siteUrl: string;
  onSuccess: (link: Link) => void;
  folders?: Folder[];
  tags?: Tag[];
  onTagCreated?: (tag: Tag) => void;
}

function LabelledInput({
  id,
  label,
  type,
  placeholder,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  type: "url" | "text";
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="block text-xs font-medium leading-4">
        {label}
      </Label>
      <Input
        id={id}
        size="default"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}

function SubmitButton({ isLoading }: { isLoading: boolean }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          创建中...
        </>
      ) : (
        "创建链接"
      )}
    </Button>
  );
}

export function CreateLinkModal({
  siteUrl,
  onSuccess,
  folders = [],
  tags = [],
  onTagCreated,
}: CreateLinkModalProps) {
  const vm = useCreateLinkViewModel(siteUrl, onSuccess);

  const assignedTags = tags.filter((t) => vm.selectedTagIds.has(t.id));

  const handleCreateTag = useCallback(
    async (name: string) => {
      const result = await createTag({ name });
      if (result.success && result.data) {
        onTagCreated?.(result.data);
        vm.addTag(result.data.id);
      }
    },
    [onTagCreated, vm],
  );

  return (
    <Dialog open={vm.isOpen} onOpenChange={vm.setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-8 shrink-0 px-0" aria-label="新建链接">
          <Plus className="w-4 h-4" strokeWidth={1.5} />
        </Button>
      </DialogTrigger>
      <DialogContent size="lg" className="max-h-[90dvh] overflow-y-auto rounded-card border-0">
        <DialogHeader>
          <DialogTitle>创建短链接</DialogTitle>
        </DialogHeader>

        <form onSubmit={vm.handleSubmit} className="space-y-4">
          <ModeTabs mode={vm.mode} setMode={vm.setMode} />

          <LabelledInput
            id="url"
            label="原始链接"
            type="url"
            placeholder="https://example.com/very-long-url"
            value={vm.url}
            onChange={vm.setUrl}
            required
          />

          {vm.mode === "custom" && (
            <SlugInput
              siteUrl={siteUrl}
              customSlug={vm.customSlug}
              setCustomSlug={vm.setCustomSlug}
              required={vm.mode === "custom"}
            />
          )}

          <FolderSelect folders={folders} folderId={vm.folderId} setFolderId={vm.setFolderId} />

          <LabelledInput
            id="title"
            label="标题"
            type="text"
            placeholder="标题（可选）"
            value={vm.title}
            onChange={vm.setTitle}
          />

          <div className="space-y-1.5">
            <Label htmlFor="note" className="block text-xs font-medium leading-4">
              备注
            </Label>
            <Textarea
              id="note"
              rows={3}
              placeholder="备注（可选）"
              value={vm.note}
              onChange={(event) => vm.setNote(event.target.value)}
            />
          </div>

          <LabelledInput
            id="screenshotUrl"
            label="截图链接"
            type="url"
            placeholder="https://example.com/screenshot.png"
            value={vm.screenshotUrl}
            onChange={vm.setScreenshotUrl}
          />

          <TagsField
            tags={tags}
            assignedTags={assignedTags}
            selectedTagIds={vm.selectedTagIds}
            onAddTag={vm.addTag}
            onRemoveTag={vm.removeTag}
            onCreateTag={handleCreateTag}
          />

          {vm.error && <p className="text-sm text-destructive">{vm.error}</p>}

          <SubmitButton isLoading={vm.isLoading} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
