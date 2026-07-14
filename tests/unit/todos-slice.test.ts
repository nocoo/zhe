// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetTodos = vi.fn();
vi.mock("@/actions/todos", () => ({
  getTodos: (...args: unknown[]) => mockGetTodos(...args),
}));

import { useTodosSlice } from "@/contexts/dashboard-service-parts/useTodosSlice";
import type { TodoTreeNode } from "@/lib/db/scoped";

function node(overrides: Partial<TodoTreeNode> & { id: number }): TodoTreeNode {
  return {
    id: overrides.id,
    parentId: overrides.parentId ?? null,
    position: overrides.position ?? 0,
    title: overrides.title ?? `t${overrides.id}`,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTodosSlice", () => {
  it("ensureTodosLoaded pulls once and memoises via the loaded flag", async () => {
    mockGetTodos.mockResolvedValue({ success: true, data: [node({ id: 1 })] });
    const { result } = renderHook(() => useTodosSlice());
    await act(async () => {
      await result.current.ensureTodosLoaded();
    });
    expect(mockGetTodos).toHaveBeenCalledTimes(1);
    expect(result.current.todos).toHaveLength(1);

    // Second call after the loaded flag flipped is a no-op.
    await act(async () => {
      await result.current.ensureTodosLoaded();
    });
    expect(mockGetTodos).toHaveBeenCalledTimes(1);
  });

  it("refreshTodos always fetches and never coalesces", async () => {
    mockGetTodos.mockResolvedValue({ success: true, data: [] });
    const { result } = renderHook(() => useTodosSlice());
    await act(async () => {
      await result.current.refreshTodos();
      await result.current.refreshTodos();
    });
    expect(mockGetTodos).toHaveBeenCalledTimes(2);
  });

  it("handleTodoCreated prepends and handleTodoUpdated replaces by id", () => {
    const { result } = renderHook(() => useTodosSlice());
    act(() => result.current.handleTodoCreated(node({ id: 1, title: "first" })));
    act(() => result.current.handleTodoCreated(node({ id: 2, title: "second" })));
    expect(result.current.todos.map((t) => t.id)).toEqual([2, 1]);
    act(() => result.current.handleTodoUpdated(node({ id: 1, title: "renamed" })));
    expect(result.current.todos.find((t) => t.id === 1)?.title).toBe("renamed");
  });

  it("handleTodoDeleted cascades: removes the row and every descendant from the shared cache", async () => {
    mockGetTodos.mockResolvedValue({
      success: true,
      data: [
        node({ id: 1 }),
        node({ id: 2, parentId: 1 }),
        node({ id: 3, parentId: 2 }),
        node({ id: 4 }),
      ],
    });
    const { result } = renderHook(() => useTodosSlice());
    await act(async () => {
      await result.current.ensureTodosLoaded();
    });
    act(() => result.current.handleTodoDeleted(1));
    expect(result.current.todos.map((t) => t.id)).toEqual([4]);
  });

  it("keeps loading falsy on a failed fetch and does not mark the cache loaded", async () => {
    mockGetTodos.mockRejectedValueOnce(new Error("boom"));
    // Silence the intentional error log from the slice.
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useTodosSlice());
    await act(async () => {
      await result.current.ensureTodosLoaded();
    });
    expect(result.current.todosLoading).toBe(false);
    // A second call must retry because the cache is still not loaded.
    mockGetTodos.mockResolvedValueOnce({ success: true, data: [node({ id: 9 })] });
    await act(async () => {
      await result.current.ensureTodosLoaded();
    });
    expect(mockGetTodos).toHaveBeenCalledTimes(2);
    expect(result.current.todos.map((t) => t.id)).toEqual([9]);
    consoleErr.mockRestore();
  });
});
