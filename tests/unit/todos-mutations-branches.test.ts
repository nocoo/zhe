// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoDetail, TodoTreeNode } from "@/lib/db/scoped";

const mockCreateTodo = vi.fn();
const mockUpdateTodo = vi.fn();
const mockDeleteTodo = vi.fn();
const mockMoveTodo = vi.fn();
const mockReorderTodoSiblings = vi.fn();

vi.mock("@/actions/todos", () => ({
  createTodo: (...args: unknown[]) => mockCreateTodo(...args),
  updateTodo: (...args: unknown[]) => mockUpdateTodo(...args),
  deleteTodo: (...args: unknown[]) => mockDeleteTodo(...args),
  moveTodo: (...args: unknown[]) => mockMoveTodo(...args),
  reorderTodoSiblings: (...args: unknown[]) => mockReorderTodoSiblings(...args),
}));

import { applyUpdateInputToDetail, useTodosMutations } from "@/viewmodels/todos/useTodosMutations";

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

function detail(id: number): TodoDetail {
  return {
    id,
    parentId: null,
    position: 0,
    title: "t",
    done: false,
    hasContent: false,
    excerpt: null,
    tagNames: [],
    dueAt: null,
    emoji: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    content: null,
    doneAt: null,
  };
}

describe("applyUpdateInputToDetail", () => {
  it("patches all input fields including null resets and empty content", () => {
    const base = detail(1);
    const patched1 = applyUpdateInputToDetail(base, {
      title: "new title",
      done: true,
      tagNames: ["tag1"],
      dueAtMs: 12345678,
      emoji: "⭐",
      content: "some content",
    });
    expect(patched1.title).toBe("new title");
    expect(patched1.done).toBe(true);
    expect(patched1.tagNames).toEqual(["tag1"]);
    expect(patched1.dueAt?.getTime()).toBe(12345678);
    expect(patched1.emoji).toBe("⭐");
    expect(patched1.content).toBe("some content");
    expect(patched1.hasContent).toBe(true);

    const patched2 = applyUpdateInputToDetail(patched1, {
      dueAtMs: null,
      content: "",
    });
    expect(patched2.dueAt).toBeNull();
    expect(patched2.content).toBe("");
    expect(patched2.hasContent).toBe(false);

    const patched3 = applyUpdateInputToDetail(patched2, {
      content: null,
    });
    expect(patched3.content).toBeNull();
    expect(patched3.hasContent).toBe(false);
  });
});

describe("useTodosMutations edge branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles createTodo unexpected thrown error", async () => {
    const { result } = renderHook(() => {
      const [todos, setTodos] = useState<TodoTreeNode[]>([]);
      return { todos, ...useTodosMutations(setTodos) };
    });

    mockCreateTodo.mockRejectedValueOnce(new Error("network error"));
    await act(async () => {
      const created = await result.current.handleCreateTodo({ title: "fail" });
      expect(created).toBeNull();
    });
    expect(result.current.error).toBe("Failed to create todo");
  });

  it("handles updateTodo done, dueAtMs, tagNames, and content updates in local state", async () => {
    const { result } = renderHook(() => {
      const [todos, setTodos] = useState<TodoTreeNode[]>([node({ id: 1 }), node({ id: 2 })]);
      return { todos, ...useTodosMutations(setTodos) };
    });

    mockUpdateTodo.mockResolvedValueOnce({
      success: true,
      data: { ...detail(1), done: true, dueAt: new Date(5000), tagNames: ["t"], hasContent: true },
    });

    await act(async () => {
      await result.current.handleUpdateTodo(1, {
        done: true,
        dueAtMs: 5000,
        tagNames: ["t"],
        content: "non-empty",
      });
    });

    const updated = result.current.todos.find((n) => n.id === 1);
    const untouched = result.current.todos.find((n) => n.id === 2);
    expect(updated?.done).toBe(true);
    expect(updated?.dueAt?.getTime()).toBe(5000);
    expect(updated?.tagNames).toEqual(["t"]);
    expect(updated?.hasContent).toBe(true);
    expect(untouched?.done).toBe(false);
    expect(untouched?.dueAt).toBeNull();
    expect(untouched?.tagNames).toEqual([]);
    expect(untouched?.hasContent).toBe(false);
  });

  it("handles deleteTodo on a node with deep children and handles exception", async () => {
    const { result } = renderHook(() => {
      const [todos, setTodos] = useState<TodoTreeNode[]>([
        node({ id: 1, parentId: null }),
        node({ id: 2, parentId: 1 }),
        node({ id: 3, parentId: 2 }),
      ]);
      return { todos, ...useTodosMutations(setTodos) };
    });

    mockDeleteTodo.mockRejectedValueOnce(new Error("fail"));
    await act(async () => {
      const res = await result.current.handleDeleteTodo(1);
      expect(res).toBe(false);
    });
    expect(result.current.todos).toHaveLength(3);
    expect(result.current.error).toBe("Failed to delete todo");
  });

  it("reorders siblings with matching position skipping unnecessary patches", async () => {
    const { result } = renderHook(() => {
      const [todos, setTodos] = useState<TodoTreeNode[]>([
        node({ id: 1, parentId: null, position: 0 }),
        node({ id: 2, parentId: null, position: 1 }),
      ]);
      return { todos, ...useTodosMutations(setTodos) };
    });

    mockReorderTodoSiblings.mockResolvedValueOnce({ success: true });
    await act(async () => {
      const res = await result.current.handleReorderSiblings(null, [1, 2]);
      expect(res).toBe(true);
    });
    expect(result.current.todos[0]?.position).toBe(0);
    expect(result.current.todos[1]?.position).toBe(1);
  });
});
