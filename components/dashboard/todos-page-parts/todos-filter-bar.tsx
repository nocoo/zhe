"use client";

/**
 * Filter/search bar for the todos page.
 *
 * Rendered inline in the page header on desktop and inside a Popover on
 * mobile — the callers control layout; this file only owns the fields and
 * writes them back through the composition viewmodel's filter slice. The
 * "Clear filters" affordance is only shown when at least one facet is
 * non-default so the toolbar stays quiet at rest.
 *
 * aria-labels remain in English to keep the existing test contracts.
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
  all: "全部截止",
  overdue: "逾期",
  today: "今日",
  tomorrow: "明日",
  soon: "近 7 天",
  later: "更晚",
  "no-due": "无截止",
  "any-due": "有截止",
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
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="搜索待办..."
          className="pl-8 h-8 w-[160px] text-xs rounded-lg"
          aria-label="Search todos"
        />
      </div>

      <Select
        value={dueFilter}
        onValueChange={(v) => onDueFilterChange(v as TodoDueFilterKind)}
      >
        <SelectTrigger
          className="w-[110px] h-8 text-xs rounded-lg"
          aria-label="Due date filter"
        >
          <SelectValue placeholder="全部截止" />
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
          className="w-[110px] h-8 text-xs rounded-lg"
          aria-label="Tag filter"
        >
          <SelectValue placeholder="全部标签" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__any">全部标签</SelectItem>
          {tagFilterOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
        <input
          type="checkbox"
          checked={showDone}
          onChange={(e) => onShowDoneChange(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        显示已完成
      </label>

      {isDirty ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-8 gap-1 text-xs"
        >
          <X className="h-3.5 w-3.5" /> 清除
        </Button>
      ) : null}
    </>
  );
}
