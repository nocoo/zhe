"use client";

/**
 * Filter/search bar for the todos page. Small, controlled — every field
 * writes back into the composition viewmodel's filter slice.
 *
 * The "Clear filters" button is only shown when at least one facet is
 * non-default, so the toolbar stays quiet at rest.
 */

import { useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TodoDueFilterKind } from "@/viewmodels/todos/useTodosFilters";

export interface TodosFilterBarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  showDone: boolean;
  onShowDoneChange: (value: boolean) => void;
  selectedTagName: string | null;
  onSelectedTagNameChange: (value: string | null) => void;
  tagFilterOptions: readonly string[];
  dueFilter: TodoDueFilterKind;
  onDueFilterChange: (value: TodoDueFilterKind) => void;
  onClearFilters: () => void;
}

const DUE_LABELS: Record<TodoDueFilterKind, string> = {
  all: "Any",
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  soon: "Soon (7d)",
  later: "Later",
  "no-due": "No due date",
  "any-due": "Has due date",
};

export function TodosFilterBar({
  searchQuery,
  onSearchQueryChange,
  showDone,
  onShowDoneChange,
  selectedTagName,
  onSelectedTagNameChange,
  tagFilterOptions,
  dueFilter,
  onDueFilterChange,
  onClearFilters,
}: TodosFilterBarProps) {
  const isDirty = useMemo(
    () =>
      searchQuery.length > 0 ||
      !showDone ||
      selectedTagName !== null ||
      dueFilter !== "all",
    [searchQuery, showDone, selectedTagName, dueFilter],
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2"
      data-todos-filter-bar
    >
      <div className="relative min-w-[10rem] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search todos"
          className="h-8 pl-7 text-xs"
          aria-label="Search todos"
        />
      </div>

      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={showDone}
          onChange={(e) => onShowDoneChange(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Show done
      </label>

      <Select
        value={dueFilter}
        onValueChange={(v) => onDueFilterChange(v as TodoDueFilterKind)}
      >
        <SelectTrigger
          className="h-8 min-w-[8rem] text-xs"
          aria-label="Due date filter"
        >
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(DUE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedTagName ?? "__any"}
        onValueChange={(v) => onSelectedTagNameChange(v === "__any" ? null : v)}
      >
        <SelectTrigger
          className="h-8 min-w-[8rem] text-xs"
          aria-label="Tag filter"
        >
          <SelectValue placeholder="All tags" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__any">All tags</SelectItem>
          {tagFilterOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isDirty ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-8 gap-1 text-xs"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      ) : null}
    </div>
  );
}
