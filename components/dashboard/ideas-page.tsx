"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  LayoutGrid,
  List,
  Search,
  X,
  Filter,
  Loader2,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { IdeaCard, IdeaRow } from "@/components/dashboard/idea-card";
import {
  useIdeasViewModel,
  type IdeasSortBy,
  type IdeasViewMode,
} from "@/viewmodels/useIdeasViewModel";
import { getTagStyles } from "@/models/tags";
import type { IdeaListItem } from "@/lib/db/scoped";

function IdeasSkeleton({ viewMode }: { viewMode: IdeasViewMode }) {
  if (viewMode === "grid") {
    return (
      <div className="animate-pulse grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-card bg-secondary overflow-hidden">
            <div className="p-4 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-card bg-secondary p-4 flex items-center gap-4"
        >
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-3 w-64 rounded bg-muted" />
          </div>
          <div className="h-3 w-16 rounded bg-muted shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function IdeasPage() {
  const vm = useIdeasViewModel();
  const router = useRouter();

  // Create modal state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTagIds, setNewTagIds] = useState<string[]>([]);

  const handleCreate = async () => {
    const success = await vm.handleCreateIdea({
      content: newContent,
      ...(newTitle.trim() && { title: newTitle.trim() }),
      ...(newTagIds.length > 0 && { tagIds: newTagIds }),
    });
    if (success) {
      setNewTitle("");
      setNewContent("");
      setNewTagIds([]);
    }
  };

  const handleNavigateToIdea = (idea: IdeaListItem) => {
    router.push(`/dashboard/ideas/${idea.id}`);
  };

  const toggleTag = (tagId: string, current: string[], setter: (ids: string[]) => void) => {
    if (current.includes(tagId)) {
      setter(current.filter((id) => id !== tagId));
    } else {
      setter([...current, tagId]);
    }
  };

  return (
    <div>
      {/* Header — single row matching links-list pattern */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <h2 className="text-lg font-semibold text-foreground shrink-0">想法</h2>
        <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {vm.searchQuery || vm.selectedTagId
              ? `${vm.ideas.length} / ${vm.allIdeas.length} 条想法`
              : `共 ${vm.allIdeas.length} 条想法`}
          </p>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索想法..."
              value={vm.searchQuery}
              onChange={(e) => vm.setSearchQuery(e.target.value)}
              className="pl-8 pr-7 h-8 w-[160px] text-xs rounded-lg"
            />
            {vm.searchQuery && (
              <button
                onClick={() => vm.setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Tag filter */}
          {vm.tagFilterOptions.length > 0 && (
            <Select
              value={vm.selectedTagId ?? "all"}
              onValueChange={(v) => vm.setSelectedTagId(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-[120px] h-8 text-xs rounded-lg">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="All tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有标签</SelectItem>
                {vm.tagFilterOptions.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={getTagStyles(tag.name).dot}
                      />
                      {tag.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Sort */}
          <Select
            value={vm.sortBy}
            onValueChange={(v) => vm.setSortBy(v as IdeasSortBy)}
          >
            <SelectTrigger className="w-[120px] h-8 text-xs rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt">最近更新</SelectItem>
              <SelectItem value="createdAt">创建时间</SelectItem>
            </SelectContent>
          </Select>

          {/* View mode toggle — matching links-list pill style */}
          <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
            <button
              onClick={() => vm.setViewMode("grid")}
              aria-label="Grid view"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                vm.viewMode === "grid"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => vm.setViewMode("list")}
              aria-label="List view"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                vm.viewMode === "list"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>

          {/* Clear filters */}
          {(vm.searchQuery || vm.selectedTagId) && (
            <button
              onClick={vm.clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              清除
            </button>
          )}

          <Button
            size="sm"
            className="rounded-widget h-7 w-7 p-0"
            onClick={() => vm.setIsCreateModalOpen(true)}
            aria-label="新想法"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {vm.loading ? (
        <IdeasSkeleton viewMode={vm.viewMode} />
      ) : vm.ideas.length === 0 ? (
        <div className="rounded-card border-0 bg-secondary shadow-none p-12 text-center">
          <Lightbulb className="w-10 h-10 mx-auto text-muted-foreground mb-4" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground mb-2">
            {vm.searchQuery || vm.selectedTagId
              ? "未找到想法"
              : "暂无想法"}
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            {vm.searchQuery || vm.selectedTagId
              ? "试试调整筛选条件"
              : "点击上方按钮记录您的第一个想法"}
          </p>
          {!vm.searchQuery && !vm.selectedTagId && (
            <Button
              size="sm"
              className="rounded-widget h-7 w-7 p-0"
              onClick={() => vm.setIsCreateModalOpen(true)}
              aria-label="新想法"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
            </Button>
          )}
        </div>
      ) : vm.viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {vm.ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              tags={vm.tags}
              onEdit={handleNavigateToIdea}
              onDelete={vm.confirmDelete}
              onClick={handleNavigateToIdea}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {vm.ideas.map((idea) => (
            <IdeaRow
              key={idea.id}
              idea={idea}
              tags={vm.tags}
              onEdit={handleNavigateToIdea}
              onDelete={vm.confirmDelete}
              onClick={handleNavigateToIdea}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
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
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewContent(e.target.value)}
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
                        onClick={() => toggleTag(tag.id, newTagIds, setNewTagIds)}
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
              onClick={handleCreate}
              disabled={!newContent.trim() || vm.isSaving}
            >
              {vm.isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
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

      {/* Error Toast */}
      {vm.error && (
        <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2">
          <span>{vm.error}</span>
          <button onClick={vm.clearError}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
