"use client";

import { useState } from "react";
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
} from "@/viewmodels/useIdeasViewModel";
import { getTagStyles } from "@/models/tags";
import type { IdeaListItem } from "@/lib/db/scoped";

export function IdeasPage() {
  const vm = useIdeasViewModel();

  // Create modal state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTagIds, setNewTagIds] = useState<string[]>([]);

  // Edit modal state
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTagIds, setEditTagIds] = useState<string[]>([]);
  const [editingIdea, setEditingIdea] = useState<IdeaListItem | null>(null);

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

  const handleEdit = (idea: IdeaListItem) => {
    setEditingIdea(idea);
    setEditTitle(idea.title);
    setEditContent(""); // Will be fetched
    setEditTagIds(idea.tagIds);
    vm.setIsEditModalOpen(true);
    // Fetch full content
    vm.fetchIdeaDetail(idea.id).then((detail) => {
      if (detail) {
        setEditContent(detail.content);
      }
    });
  };

  const handleSaveEdit = async () => {
    if (!editingIdea) return;
    const success = await vm.handleUpdateIdea(editingIdea.id, {
      content: editContent,
      title: editTitle,
      tagIds: editTagIds,
    });
    if (success) {
      setEditingIdea(null);
    }
  };

  const handleCloseEdit = () => {
    vm.setIsEditModalOpen(false);
    setEditingIdea(null);
  };

  const handleIdeaClick = async (idea: IdeaListItem) => {
    handleEdit(idea);
  };

  const toggleTag = (tagId: string, current: string[], setter: (ids: string[]) => void) => {
    if (current.includes(tagId)) {
      setter(current.filter((id) => id !== tagId));
    } else {
      setter([...current, tagId]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-xl font-semibold">想法</h1>
            <Badge variant="secondary" className="text-xs">
              {vm.allIdeas.length}
            </Badge>
          </div>
          <Button onClick={() => vm.setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新想法
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索想法..."
              value={vm.searchQuery}
              onChange={(e) => vm.setSearchQuery(e.target.value)}
              className="pl-9 pr-8"
            />
            {vm.searchQuery && (
              <button
                onClick={() => vm.setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Tag filter */}
          {vm.tagFilterOptions.length > 0 && (
            <Select
              value={vm.selectedTagId ?? "all"}
              onValueChange={(v) => vm.setSelectedTagId(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-[140px]">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有标签</SelectItem>
                {vm.tagFilterOptions.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={getTagStyles(tag.color).dot}
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
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt">最近更新</SelectItem>
              <SelectItem value="createdAt">创建时间</SelectItem>
            </SelectContent>
          </Select>

          {/* View mode */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={vm.viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => vm.setViewMode("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={vm.viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => vm.setViewMode("list")}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Clear filters */}
          {(vm.searchQuery || vm.selectedTagId) && (
            <Button variant="ghost" size="sm" onClick={vm.clearFilters}>
              清除筛选
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {vm.loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : vm.ideas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Lightbulb className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {vm.searchQuery || vm.selectedTagId
                ? "未找到想法"
                : "还没有想法"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {vm.searchQuery || vm.selectedTagId
                ? "试试调整筛选条件"
                : "在这里记录您的想法"}
            </p>
            {!vm.searchQuery && !vm.selectedTagId && (
              <Button onClick={() => vm.setIsCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新想法
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
                onEdit={handleEdit}
                onDelete={vm.confirmDelete}
                onClick={handleIdeaClick}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {vm.ideas.map((idea) => (
              <IdeaRow
                key={idea.id}
                idea={idea}
                tags={vm.tags}
                onEdit={handleEdit}
                onDelete={vm.confirmDelete}
                onClick={handleIdeaClick}
              />
            ))}
          </div>
        )}
      </div>

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
                    const styles = getTagStyles(tag.color);
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

      {/* Edit Modal */}
      <Dialog open={vm.isEditModalOpen} onOpenChange={handleCloseEdit}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑想法</DialogTitle>
          </DialogHeader>
          {vm.loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-title">标题</Label>
                <Input
                  id="edit-title"
                  placeholder="标题 (留空则使用日期)"
                  value={editTitle ?? ""}
                  onChange={(e) => setEditTitle(e.target.value || null)}
                />
              </div>
              <div>
                <Label htmlFor="edit-content">内容</Label>
                <Textarea
                  id="edit-content"
                  placeholder="在这里写下您的想法..."
                  value={editContent}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                  rows={8}
                />
              </div>
              {vm.tags.length > 0 && (
                <div>
                  <Label>标签</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {vm.tags.map((tag) => {
                      const isSelected = editTagIds.includes(tag.id);
                      const styles = getTagStyles(tag.color);
                      return (
                        <Badge
                          key={tag.id}
                          variant={isSelected ? "default" : "outline"}
                          className="cursor-pointer"
                          style={isSelected ? styles.badge : undefined}
                          onClick={() => toggleTag(tag.id, editTagIds, setEditTagIds)}
                        >
                          {tag.name}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEdit}>
              取消
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editContent.trim() || vm.isSaving || vm.loadingDetail}
            >
              {vm.isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存
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
