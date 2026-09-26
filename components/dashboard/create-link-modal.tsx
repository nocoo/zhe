"use client";

import { Loader2 } from "lucide-react";
import { type ReactNode, type Ref, useCallback, useRef } from "react";
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
  trigger: ReactNode;
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
  inputRef,
}: {
  id: string;
  label: string;
  type: "url" | "text";
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="block text-xs font-medium leading-4">
        {label}
      </Label>
      <Input
        ref={inputRef}
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
  trigger,
  onSuccess,
  folders = [],
  tags = [],
  onTagCreated,
}: CreateLinkModalProps) {
  const vm = useCreateLinkViewModel(siteUrl, onSuccess);
  const urlInput = useRef<HTMLInputElement>(null);

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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        size="lg"
        className="create-dialog max-h-[90dvh] overflow-y-auto rounded-card border-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          urlInput.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>创建短链接</DialogTitle>
        </DialogHeader>

        <form onSubmit={vm.handleSubmit} className="space-y-4">
          <ModeTabs mode={vm.mode} setMode={vm.setMode} />

          <LabelledInput
            inputRef={urlInput}
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
