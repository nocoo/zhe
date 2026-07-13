// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { TodoTreeNode } from "@/lib/db/scoped";
import { useTodosFilters } from "@/viewmodels/todos/useTodosFilters";

function node(overrides: Partial<TodoTreeNode> & { id: number }): TodoTreeNode {
  return {
    id: overrides.id,
    parentId: overrides.parentId ?? null,
    position: overrides.position ?? 0,
    title: overrides.title ?? `todo-${overrides.id}`,
    done: overrides.done ?? false,
    hasContent: overrides.hasContent ?? false,
    excerpt: null,
    tagNames: overrides.tagNames ?? [],
    dueAt: overrides.dueAt ?? null,
    emoji: overrides.emoji ?? null,
    createdAt: overrides.createdAt ?? new Date(0),
    updatedAt: overrides.updatedAt ?? new Date(0),
  };
}

describe("useTodosFilters", () => {
  it("combines search + tag + showDone facets", () => {
    const todos = [
      node({ id: 1, title: "Buy Milk", tagNames: ["shopping"], done: true }),
      node({ id: 2, title: "Read book", tagNames: ["reading"] }),
      node({ id: 3, title: "Read groceries list", tagNames: ["shopping"] }),
    ];
    const { result } = renderHook(() => useTodosFilters(todos));

    // Default: all three visible.
    expect(result.current.filteredTodos).toHaveLength(3);

    act(() => result.current.setSearchQuery("read"));
    expect(result.current.filteredTodos.map((n) => n.id).sort()).toEqual([2, 3]);

    act(() => result.current.setSelectedTagName("shopping"));
    expect(result.current.filteredTodos.map((n) => n.id)).toEqual([3]);

    act(() => result.current.setShowDone(false));
    // #1 was already hidden by the search — still #3 only.
    expect(result.current.filteredTodos.map((n) => n.id)).toEqual([3]);

    act(() => result.current.clearFilters());
    expect(result.current.filteredTodos).toHaveLength(3);
  });

  it("tagFilterOptions is the sorted set of all tag names across the tree", () => {
    const todos = [
      node({ id: 1, tagNames: ["Zebra"] }),
      node({ id: 2, tagNames: ["Apple", "Zebra"] }),
    ];
    const { result } = renderHook(() => useTodosFilters(todos));
    expect(result.current.tagFilterOptions).toEqual(["Apple", "Zebra"]);
  });
});
