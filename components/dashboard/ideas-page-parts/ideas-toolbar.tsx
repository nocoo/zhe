"use client";

import { Filter, LayoutGrid, List, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTagStyles } from "@/models/tags";
import type { IdeasSortBy, IdeasViewModel } from "@/viewmodels/useIdeasViewModel";
import { IconAction } from "../icon-action";

function SearchBox({ vm }: { vm: IdeasViewModel }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        size="sm"
        placeholder="搜索想法..."
        value={vm.searchQuery}
        onChange={(e) => vm.setSearchQuery(e.target.value)}
        className="pl-8 pr-7 w-[160px]"
      />
      {vm.searchQuery && (
        <button
          type="button"
          onClick={() => vm.setSearchQuery("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted"
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
      <SelectTrigger size="sm" className="w-[120px]">
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
                style={getTagStyles(tag.name, tag.color).dot}
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
      <SelectTrigger size="sm" className="w-[120px]">
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
  return (
    <>
      <IconAction
        density="toolbar"
        variant={vm.viewMode === "grid" ? "secondary" : "outline"}
        aria-pressed={vm.viewMode === "grid"}
        label="Grid view"
        onClick={() => vm.setViewMode("grid")}
      >
        <LayoutGrid aria-hidden />
      </IconAction>
      <IconAction
        density="toolbar"
        variant={vm.viewMode === "list" ? "secondary" : "outline"}
        aria-pressed={vm.viewMode === "list"}
        label="List view"
        onClick={() => vm.setViewMode("list")}
      >
        <List aria-hidden />
      </IconAction>
    </>
  );
}

export function IdeasToolbar({
  vm,
  selectionActions,
  selecting,
}: {
  vm: IdeasViewModel;
  selectionActions?: React.ReactNode;
  selecting?: boolean;
}) {
  const filtered = Boolean(vm.searchQuery || vm.selectedTagId);
  return (
    <PageHeader
      title="想法"
      meta={
        filtered
          ? `${vm.ideas.length} / ${vm.allIdeas.length} 条想法`
          : `共 ${vm.allIdeas.length} 条想法`
      }
      actions={
        <>
          {!selecting && (
            <>
              <SearchBox vm={vm} />
              <TagFilter vm={vm} />
              <SortSelect vm={vm} />
              <ViewModeToggle vm={vm} />
              {filtered ? (
                <Button type="button" variant="ghost" size="sm" onClick={vm.clearFilters}>
                  清除
                </Button>
              ) : null}
            </>
          )}
          {selectionActions}
        </>
      }
    />
  );
}
