"use client";

import { Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getTagStyles } from "@/models/tags";
import type { IdeasViewModel } from "@/viewmodels/useIdeasViewModel";

interface CreateIdeaModalProps {
  vm: IdeasViewModel;
  newTitle: string;
  setNewTitle: (v: string) => void;
  newContent: string;
  setNewContent: (v: string) => void;
  newTagIds: string[];
  toggleTag: (tagId: string) => void;
  onCreate: () => void;
}

export function CreateIdeaModal({
  vm,
  newTitle,
  setNewTitle,
  newContent,
  setNewContent,
  newTagIds,
  toggleTag,
  onCreate,
}: CreateIdeaModalProps) {
  return (
    <Dialog open={vm.isCreateModalOpen} onOpenChange={vm.setIsCreateModalOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新想法</DialogTitle>
          <DialogDescription>
            记录新的想法，支持 Markdown 格式。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="new-title">标题 (可选)</Label>
            <Input
              id="new-title"
              placeholder="为您的想法添加标题..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-content">内容</Label>
            <Textarea
              id="new-content"
              placeholder="在这里写下您的想法... (支持 Markdown)"
              value={newContent}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNewContent(e.target.value)
              }
              rows={8}
            />
          </div>
          {vm.tags.length > 0 && (
            <div>
              <Label>标签</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {vm.tags.map((tag) => {
                  const isSelected = newTagIds.includes(tag.id);
                  const styles = getTagStyles(tag.name);
                  return (
                    <Badge
                      key={tag.id}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer"
                      style={isSelected ? styles.badge : undefined}
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => vm.setIsCreateModalOpen(false)}>
            取消
          </Button>
          <Button
            onClick={onCreate}
            disabled={!newContent.trim() || vm.isSaving}
          >
            {vm.isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteIdeaConfirm({ vm }: { vm: IdeasViewModel }) {
  return (
    <Dialog open={vm.isDeleteConfirmOpen} onOpenChange={vm.cancelDelete}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除想法</DialogTitle>
          <DialogDescription>
            确定要删除这个想法吗？此操作无法撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={vm.cancelDelete}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={vm.executeDelete}
            disabled={vm.isDeleting}
          >
            {vm.isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ErrorToast({
  message,
  onClear,
}: {
  message: string;
  onClear: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2">
      <span>{message}</span>
      <button onClick={onClear}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
