"use client";

import { useCallback, useMemo, useState } from "react";
import type { TodoTreeNode } from "@/lib/db/scoped";
import type { DueStatus } from "@/lib/todo-due";
import { filterTodos } from "@/models/todos";

export type TodoDueFilterKind =
  | "all"
  | "overdue"
  | "today"
  | "tomorrow"
  | "soon"
  | "later"
  | "no-due"
  | "any-due";

/**
 * Filter state for the todo tree page. Keeps a small state surface — the
 * heavy lifting lives in `filterTodos()` in `models/todos.ts`.
 */
export function useTodosFilters(todos: TodoTreeNode[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showDone, setShowDone] = useState(true);
  const [selectedTagName, setSelectedTagName] = useState<string | null>(null);
  const [dueFilter, setDueFilter] = useState<TodoDueFilterKind>("all");

  const filteredTodos = useMemo(() => {
    return filterTodos(todos, {
      query: searchQuery || undefined,
      showDone,
      tagName: selectedTagName ?? undefined,
      dueKind: dueFilter === "all" ? undefined : (dueFilter as DueStatus["kind"] | "any-due"),
    });
  }, [todos, searchQuery, showDone, selectedTagName, dueFilter]);

  const tagFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of todos) for (const t of n.tagNames) set.add(t);
    return [...set].sort();
  }, [todos]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTagName(null);
    setDueFilter("all");
    setShowDone(true);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    showDone,
    setShowDone,
    selectedTagName,
    setSelectedTagName,
    dueFilter,
    setDueFilter,
    filteredTodos,
    tagFilterOptions,
    clearFilters,
  };
}
