"use client";

import { Button } from "@nocoo/basalt/components/button";
import { Input } from "@nocoo/basalt/components/input";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nocoo/basalt/components/select";
import { Filter, Search, X } from "@nocoo/basalt/icons";
import { getTagStyles } from "@/models/tags";
import type { IdeasSortBy, IdeasViewModel } from "@/viewmodels/useIdeasViewModel";
import { ViewModeToggle } from "../view-mode-toggle";

function SearchBox({ vm }: { vm: IdeasViewModel }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-basalt-muted-foreground" />
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-basalt-muted"
        >
          <X className="h-3 w-3 text-basalt-muted-foreground" />
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
      <SelectTrigger size="sm" className="w-[128px] whitespace-nowrap">
        <Filter className="h-3.5 w-3.5 shrink-0 text-basalt-muted-foreground" />
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
      <SelectTrigger size="sm" className="w-[112px] whitespace-nowrap">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="updatedAt">最近更新</SelectItem>
        <SelectItem value="createdAt">创建时间</SelectItem>
      </SelectContent>
    </Select>
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
      description={
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
              <ViewModeToggle value={vm.viewMode} onChange={vm.setViewMode} />
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
