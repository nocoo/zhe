"use client";

import { useCallback } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateLinkViewModel } from "@/viewmodels/useLinksViewModel";
import { createTag } from "@/actions/tags";
import type { Link, Folder, Tag } from "@/models/types";
import {
  ModeTabs,
  SlugInput,
  FolderSelect,
  TagsField,
} from "./create-link-modal-parts/fields";

interface CreateLinkModalProps {
  siteUrl: string;
  onSuccess: (link: Link) => void;
  folders?: Folder[];
  tags?: Tag[];
  onTagCreated?: (tag: Tag) => void;
}

const INPUT_CLS =
  "rounded-widget border-border bg-secondary text-sm placeholder:text-muted-foreground focus-visible:ring-primary";

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
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm text-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={INPUT_CLS}
      />
    </div>
  );
}

function SubmitButton({ isLoading }: { isLoading: boolean }) {
  return (
    <button
      type="submit"
      className="flex w-full items-center justify-center gap-2 rounded-widget bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          创建中...
        </>
      ) : (
        "创建链接"
      )}
    </button>
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
        <Button
          size="sm"
          className="rounded-widget h-7 w-7 p-0"
          aria-label="新建链接"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-card border-0 bg-background">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">创建短链接</DialogTitle>
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

          <FolderSelect
            folders={folders}
            folderId={vm.folderId}
            setFolderId={vm.setFolderId}
          />

          <LabelledInput
            id="note"
            label="备注"
            type="text"
            placeholder="添加备注..."
            value={vm.note}
            onChange={vm.setNote}
          />

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
