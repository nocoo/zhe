"use client";

import { Filter, LayoutGrid, List, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTagStyles } from "@/models/tags";
import type {
  IdeasSortBy,
  IdeasViewModel,
} from "@/viewmodels/useIdeasViewModel";

function SearchBox({ vm }: { vm: IdeasViewModel }) {
  return (
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
  );
}

function TagFilter({ vm }: { vm: IdeasViewModel }) {
  if (vm.tagFilterOptions.length === 0) return null;
  return (
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
  );
}

function SortSelect({ vm }: { vm: IdeasViewModel }) {
  return (
    <Select value={vm.sortBy} onValueChange={(v) => vm.setSortBy(v as IdeasSortBy)}>
      <SelectTrigger className="w-[120px] h-8 text-xs rounded-lg">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="updatedAt">最近更新</SelectItem>
        <SelectItem value="createdAt">创建时间</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ViewModeToggle({ vm }: { vm: IdeasViewModel }) {
  const cls = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
      active
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:text-foreground"
    }`;
  return (
    <div className="flex items-center rounded-widget bg-background p-0.5">
      <button
        onClick={() => vm.setViewMode("grid")}
        aria-label="Grid view"
        className={cls(vm.viewMode === "grid")}
      >
        <LayoutGrid className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button
        onClick={() => vm.setViewMode("list")}
        aria-label="List view"
        className={cls(vm.viewMode === "list")}
      >
        <List className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function IdeasToolbar({ vm }: { vm: IdeasViewModel }) {
  return (
    <div className="flex items-center justify-between mb-6 gap-4">
      <h2 className="text-lg font-semibold text-foreground shrink-0">想法</h2>
      <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
        <p className="text-sm text-muted-foreground whitespace-nowrap">
          {vm.searchQuery || vm.selectedTagId
            ? `${vm.ideas.length} / ${vm.allIdeas.length} 条想法`
            : `共 ${vm.allIdeas.length} 条想法`}
        </p>

        <SearchBox vm={vm} />
        <TagFilter vm={vm} />
        <SortSelect vm={vm} />
        <ViewModeToggle vm={vm} />

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
  );
}
