"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SuggestLinkOrgViewModel } from "@/viewmodels/useSuggestLinkOrgViewModel";

export function SuggestLinkOrgDialog({ vm }: { vm: SuggestLinkOrgViewModel }) {
  return (
    <Dialog open={vm.open} onOpenChange={(next) => !next && vm.close()}>
      <DialogContent data-testid="suggest-link-org-dialog">
        <DialogHeader>
          <DialogTitle>整理建议</DialogTitle>
        </DialogHeader>

        {vm.loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : vm.error ? (
          <p className="text-sm text-destructive" data-testid="suggest-error">
            {vm.error}
          </p>
        ) : (
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">文件夹</h3>
              {vm.folders.map((folder) => {
                const value = folder.folderId ?? "inbox";
                return (
                  <label key={value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="suggest-folder"
                      className="mt-1"
                      checked={(vm.selectedFolderId ?? "inbox") === value}
                      onChange={() => vm.setSelectedFolderId(folder.folderId)}
                    />
                    <span>
                      <span className="font-medium">{folder.name}</span>
                      <span className="block text-xs text-muted-foreground">{folder.reason}</span>
                    </span>
                  </label>
                );
              })}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">标签</h3>
              {vm.tags.map((tag, index) => (
                <div key={`${tag.tagId ?? "new"}-${tag.name}`} className="flex items-start gap-2">
                  <Checkbox
                    size="sm"
                    checked={tag.checked}
                    onCheckedChange={() => vm.toggleTag(index)}
                    aria-label={`选择标签 ${tag.draftName}`}
                  />
                  <div className="min-w-0 flex-1">
                    {tag.tagId ? (
                      <p className="text-sm font-medium">{tag.name}</p>
                    ) : (
                      <Input
                        size="sm"
                        value={tag.draftName}
                        onChange={(e) => vm.renameTag(index, e.target.value)}
                        aria-label="新标签名"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">{tag.reason}</p>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={vm.close}>
            取消
          </Button>
          <Button
            onClick={() => void vm.apply()}
            disabled={vm.loading || vm.applying || Boolean(vm.error)}
            data-testid="suggest-apply"
          >
            {vm.applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            应用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
