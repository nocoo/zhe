"use client";

import { LayoutGrid, LayoutList, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LinkFilterBar } from "../link-filter-bar";
import type { Folder, Tag } from "@/models/types";

type ViewMode = "list" | "grid";

interface FilterControlsProps {
  folders: Folder[];
  tags: Tag[];
  filterFolderId: string | null;
  filterTagIds: Set<string>;
  onFolderChange: (id: string | null) => void;
  onToggleTag: (tagId: string) => void;
  onClearFilters: () => void;
  showFolderFilter: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

/** Filter bar + view-mode pill + refresh button. Used inline (desktop) or inside a Popover (mobile). */
function FilterControls(props: FilterControlsProps) {
  const {
    folders,
    tags,
    filterFolderId,
    filterTagIds,
    onFolderChange,
    onToggleTag,
    onClearFilters,
    showFolderFilter,
    viewMode,
    onViewModeChange,
    onRefresh,
    isRefreshing,
  } = props;

  return (
    <>
      <LinkFilterBar
        folders={folders}
        tags={tags}
        filterFolderId={filterFolderId}
        filterTagIds={filterTagIds}
        onFolderChange={onFolderChange}
        onToggleTag={onToggleTag}
        onClear={onClearFilters}
        showFolderFilter={showFolderFilter}
      />
      <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
        <button
          onClick={() => onViewModeChange("list")}
          aria-label="List view"
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            viewMode === "list"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutList className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onViewModeChange("grid")}
          aria-label="Grid view"
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            viewMode === "grid"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="rounded-widget h-7 w-7 p-0"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label="刷新链接"
      >
        <RefreshCw
          className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
          strokeWidth={1.5}
        />
      </Button>
    </>
  );
}

interface ToolbarProps extends FilterControlsProps {
  headerTitle: string;
  linkCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  isMobile: boolean;
  mobileFilterOpen: boolean;
  setMobileFilterOpen: (open: boolean) => void;
  createButton: React.ReactNode;
}

export function LinksListToolbar(props: ToolbarProps) {
  const {
    headerTitle,
    linkCount,
    totalCount,
    hasActiveFilters,
    activeFilterCount,
    isMobile,
    mobileFilterOpen,
    setMobileFilterOpen,
    createButton,
    ...controls
  } = props;

  return (
    <div className="flex items-center justify-between mb-6 gap-4">
      <h2 className="text-lg font-semibold text-foreground shrink-0">
        {headerTitle}
      </h2>
      <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
        <p className="text-sm text-muted-foreground whitespace-nowrap">
          {hasActiveFilters
            ? `${linkCount} / ${totalCount} 条链接`
            : `共 ${linkCount} 条链接`}
        </p>

        {!isMobile && <FilterControls {...controls} />}

        {isMobile && (
          <Popover open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-widget h-8 gap-1.5 px-2.5 text-xs"
                aria-label="筛选与视图"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>筛选</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[calc(100vw-2rem)] max-w-xs p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <FilterControls {...controls} />
              </div>
            </PopoverContent>
          </Popover>
        )}

        {createButton}
      </div>
    </div>
  );
}
