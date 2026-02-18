"use client";

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
import { stripProtocol } from "@/models/links";
import type { Link, Folder } from "@/models/types";

interface CreateLinkModalProps {
  siteUrl: string;
  onSuccess: (link: Link) => void;
  folders?: Folder[];
}

export function CreateLinkModal({ siteUrl, onSuccess, folders = [] }: CreateLinkModalProps) {
  const vm = useCreateLinkViewModel(siteUrl, onSuccess);

  return (
    <Dialog open={vm.isOpen} onOpenChange={vm.setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-[10px]">
          <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
          新建链接
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-[14px] border-0 bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            创建短链接
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={vm.handleSubmit} className="space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => vm.setMode("simple")}
              className={`flex-1 py-2 text-sm rounded-[10px] transition-colors ${
                vm.mode === "simple"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              简单模式
            </button>
            <button
              type="button"
              onClick={() => vm.setMode("custom")}
              className={`flex-1 py-2 text-sm rounded-[10px] transition-colors ${
                vm.mode === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              自定义 slug
            </button>
          </div>

          {/* URL input */}
          <div className="space-y-2">
            <Label htmlFor="url" className="text-sm text-foreground">
              原始链接
            </Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/very-long-url"
              value={vm.url}
              onChange={(e) => vm.setUrl(e.target.value)}
              required
              className="rounded-[10px] border-border bg-secondary text-sm placeholder:text-muted-foreground focus-visible:ring-primary"
            />
          </div>

          {/* Custom slug input */}
          {vm.mode === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="slug" className="text-sm text-foreground">
                自定义 slug
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm whitespace-nowrap">
                  {stripProtocol(siteUrl)}/
                </span>
                <Input
                  id="slug"
                  type="text"
                  placeholder="my-custom-link"
                  value={vm.customSlug}
                  onChange={(e) => vm.setCustomSlug(e.target.value)}
                  pattern="^[a-zA-Z0-9_-]+$"
                  title="Only letters, numbers, hyphens, and underscores"
                  required={vm.mode === "custom"}
                  className="rounded-[10px] border-border bg-secondary text-sm placeholder:text-muted-foreground focus-visible:ring-primary"
                />
              </div>
            </div>
          )}

          {/* Folder selector */}
          {folders.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="folder" className="text-sm text-foreground">
                文件夹
              </Label>
              <select
                id="folder"
                value={vm.folderId ?? ""}
                onChange={(e) =>
                  vm.setFolderId(e.target.value || undefined)
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

          {/* Error message */}
          {vm.error && (
            <p className="text-sm text-destructive">{vm.error}</p>
          )}

          {/* Submit button */}
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            disabled={vm.isLoading}
          >
            {vm.isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                创建中...
              </>
            ) : (
              "创建链接"
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
