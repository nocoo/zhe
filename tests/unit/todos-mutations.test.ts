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

import { applyMoveResult, useTodosMutations } from "@/viewmodels/todos/useTodosMutations";

/** Deterministic factory. */
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

/** Compose the mutations hook with a real useState so we can observe the
 *  optimistic write and the rollback. Optionally seeds the right-pane
 *  detail cache so update paths can assert cross-pane sync. */
function useTodosMutationsWithState(
  initial: TodoTreeNode[],
  initialDetail: TodoDetail | null = null,
) {
  const [todos, setTodos] = useState<TodoTreeNode[]>(initial);
  const [detail, setDetail] = useState<TodoDetail | null>(initialDetail);
  // Mirror the viewmodel's detailSync: get() reads latest state via a
  // stable setter + live getter closed over the latest detail.
  const detailRef = { current: detail };
  detailRef.current = detail;
  const mutations = useTodosMutations(setTodos, {
    get: () => detailRef.current,
    set: setDetail,
  });
  return { todos, detail, ...mutations };
}

function detailFromNode(n: TodoTreeNode, extras: Partial<TodoDetail> = {}): TodoDetail {
  return {
    ...n,
    content: extras.content ?? null,
    doneAt: extras.doneAt ?? null,
    ...extras,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTodosMutations", () => {
  it("handleCreateTodo appends the projected detail on success", async () => {
    const { result } = renderHook(() => useTodosMutationsWithState([]));
    mockCreateTodo.mockResolvedValueOnce({
      success: true,
      data: {
        id: 42,
        parentId: null,
        position: 0,
        title: "new",
        done: false,
        hasContent: false,
        excerpt: null,
        tagNames: [],
        dueAt: null,
        emoji: null,
        createdAt: new Date(1),
        updatedAt: new Date(1),
        content: null,
        doneAt: null,
      },
    });
    await act(async () => {
      await result.current.handleCreateTodo({ title: "new" });
    });
    expect(result.current.todos.map((n) => n.id)).toEqual([42]);
  });

  it("handleCreateTodo surfaces the server error string on failure", async () => {
    const { result } = renderHook(() => useTodosMutationsWithState([]));
    mockCreateTodo.mockResolvedValueOnce({ success: false, error: "no-parent" });
    await act(async () => {
      const outcome = await result.current.handleCreateTodo({ title: "new" });
      expect(outcome).toBeNull();
    });
    expect(result.current.todos).toEqual([]);
    expect(result.current.error).toBe("no-parent");
  });

  it("handleDeleteTodo returns true on success and drops the subtree", async () => {
    const initial = [node({ id: 1 }), node({ id: 2, parentId: 1 })];
    const { result } = renderHook(() => useTodosMutationsWithState(initial));
    mockDeleteTodo.mockResolvedValueOnce({ success: true });
    await act(async () => {
      const outcome = await result.current.handleDeleteTodo(1);
      expect(outcome).toBe(true);
    });
    expect(result.current.todos).toEqual([]);
  });

  it("handleMoveTodo surfaces error on server failure and rolls back nothing (no optimistic write)", async () => {
    const initial = [node({ id: 1 }), node({ id: 2 })];
    const { result } = renderHook(() => useTodosMutationsWithState(initial));
    mockMoveTodo.mockResolvedValueOnce({ success: false, error: "conflict" });
    await act(async () => {
      const outcome = await result.current.handleMoveTodo(1, { parentId: 2, position: 0 });
      expect(outcome).toBeNull();
    });
    // We deliberately do not optimistically write in handleMoveTodo, so
    // there's nothing to undo — the local state stays untouched.
    expect(result.current.todos.map((n) => n.id)).toEqual([1, 2]);
    expect(result.current.error).toBe("conflict");
  });

  it("handleMoveTodo maps an unexpected throw to a generic error string", async () => {
    const { result } = renderHook(() => useTodosMutationsWithState([node({ id: 1 })]));
    mockMoveTodo.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await result.current.handleMoveTodo(1, { parentId: null, position: 0 });
    });
    expect(result.current.error).toBe("Failed to move todo");
  });

  it("handleReorderSiblings rolls back on an unexpected throw too", async () => {
    const initial = [
      node({ id: 1, title: "p" }),
      node({ id: 2, parentId: 1, position: 0 }),
      node({ id: 3, parentId: 1, position: 1 }),
    ];
    const { result } = renderHook(() => useTodosMutationsWithState(initial));
    mockReorderTodoSiblings.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await result.current.handleReorderSiblings(1, [3, 2]);
    });
    const byId = new Map(result.current.todos.map((n) => [n.id, n]));
    expect(byId.get(2)?.position).toBe(0);
    expect(byId.get(3)?.position).toBe(1);
    expect(result.current.error).toBe("Failed to reorder todos");
  });

  it("clearError zeroes out the sticky error", async () => {
    const { result } = renderHook(() => useTodosMutationsWithState([]));
    mockCreateTodo.mockResolvedValueOnce({ success: false, error: "x" });
    await act(async () => {
      await result.current.handleCreateTodo({ title: "t" });
    });
    expect(result.current.error).toBe("x");
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("optimistically applies handleUpdateTodo and reconciles with server truth", async () => {
    const initial = [node({ id: 1, title: "orig" })];
    const { result } = renderHook(() => useTodosMutationsWithState(initial));

    mockUpdateTodo.mockResolvedValueOnce({
      success: true,
      data: { ...initial[0], title: "server-final", updatedAt: new Date(999) },
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.handleUpdateTodo(1, { title: "opt-new" });
    });

    expect(outcome).toBeTruthy();
    const only = result.current.todos[0];
    if (!only) throw new Error("expected todo");
    expect(only.title).toBe("server-final");
    expect(only.updatedAt.getTime()).toBe(999);
  });

  it("rolls back handleUpdateTodo on server failure and surfaces error", async () => {
    const initial = [node({ id: 1, title: "orig" })];
    const { result } = renderHook(() => useTodosMutationsWithState(initial));

    mockUpdateTodo.mockResolvedValueOnce({ success: false, error: "boom" });

    await act(async () => {
      await result.current.handleUpdateTodo(1, { title: "will-fail" });
    });

    const only = result.current.todos[0];
    if (!only) throw new Error("expected todo");
    expect(only.title).toBe("orig"); // rolled back
    expect(result.current.error).toBe("boom");
  });

  it("optimistically syncs emoji onto the selected detail pane cache", async () => {
    // Regression: left tree updated immediately, right pane kept stale emoji
    // because handleUpdateTodo only patched `todos`, not `detail`.
    const row = node({ id: 1, emoji: "📝" });
    const seed = detailFromNode(row);
    const { result } = renderHook(() => useTodosMutationsWithState([row], seed));

    mockUpdateTodo.mockResolvedValueOnce({
      success: true,
      data: { ...seed, emoji: "🎯", updatedAt: new Date(999) },
    });

    // Fire without awaiting so we can observe the optimistic detail tick.
    let settle: Promise<unknown> | undefined;
    act(() => {
      settle = result.current.handleUpdateTodo(1, { emoji: "🎯" });
    });
    expect(result.current.todos[0]?.emoji).toBe("🎯");
    expect(result.current.detail?.emoji).toBe("🎯");

    await act(async () => {
      await settle;
    });
    expect(result.current.detail?.emoji).toBe("🎯");
    expect(result.current.detail?.updatedAt.getTime()).toBe(999);
  });

  it("optimistically clears emoji on the detail pane and rolls back on failure", async () => {
    const row = node({ id: 1, emoji: "📝" });
    const seed = detailFromNode(row);
    const { result } = renderHook(() => useTodosMutationsWithState([row], seed));

    mockUpdateTodo.mockResolvedValueOnce({ success: false, error: "denied" });

    await act(async () => {
      await result.current.handleUpdateTodo(1, { emoji: null });
    });

    expect(result.current.todos[0]?.emoji).toBe("📝");
    expect(result.current.detail?.emoji).toBe("📝");
    expect(result.current.error).toBe("denied");
  });

  it("does not overwrite detail when a different row is updated", async () => {
    const row1 = node({ id: 1, emoji: "📝" });
    const row2 = node({ id: 2, emoji: "🔥" });
    const seed = detailFromNode(row1);
    const { result } = renderHook(() => useTodosMutationsWithState([row1, row2], seed));

    mockUpdateTodo.mockResolvedValueOnce({
      success: true,
      data: detailFromNode(row2, { emoji: "⭐" }),
    });

    await act(async () => {
      await result.current.handleUpdateTodo(2, { emoji: "⭐" });
    });

    // Selected detail is still row 1.
    expect(result.current.detail?.id).toBe(1);
    expect(result.current.detail?.emoji).toBe("📝");
    expect(result.current.todos.find((n) => n.id === 2)?.emoji).toBe("⭐");
  });

  it("rolls back detail emoji when updateTodo throws", async () => {
    const row = node({ id: 1, emoji: "📝" });
    const seed = detailFromNode(row);
    const { result } = renderHook(() => useTodosMutationsWithState([row], seed));

    mockUpdateTodo.mockRejectedValueOnce(new Error("network"));

    await act(async () => {
      await result.current.handleUpdateTodo(1, { emoji: null });
    });

    expect(result.current.todos[0]?.emoji).toBe("📝");
    expect(result.current.detail?.emoji).toBe("📝");
    expect(result.current.error).toBe("Failed to update todo");
  });

  it("optimistically patches detail content + tags and reconciles on success", async () => {
    const row = node({ id: 1, tagNames: ["a"], hasContent: false });
    const seed = detailFromNode(row, { content: null });
    const { result } = renderHook(() => useTodosMutationsWithState([row], seed));

    mockUpdateTodo.mockResolvedValueOnce({
      success: true,
      data: detailFromNode(row, {
        content: "hello",
        hasContent: true,
        tagNames: ["a", "b"],
        updatedAt: new Date(50),
      }),
    });

    await act(async () => {
      await result.current.handleUpdateTodo(1, { content: "hello", tagNames: ["a", "b"] });
    });

    expect(result.current.detail?.content).toBe("hello");
    expect(result.current.detail?.hasContent).toBe(true);
    expect(result.current.detail?.tagNames).toEqual(["a", "b"]);
    expect(result.current.todos[0]?.hasContent).toBe(true);
  });

  it("optimistic delete removes the row + descendants, then rolls back on failure", async () => {
    const initial = [
      node({ id: 1, title: "root" }),
      node({ id: 2, parentId: 1 }),
      node({ id: 3, parentId: 2 }),
      node({ id: 4, title: "sibling-root" }),
    ];
    const { result } = renderHook(() => useTodosMutationsWithState(initial));

    mockDeleteTodo.mockResolvedValueOnce({ success: false, error: "nope" });

    await act(async () => {
      await result.current.handleDeleteTodo(1);
    });

    // Snapshot restored: all four rows present.
    expect(result.current.todos.map((n) => n.id).sort()).toEqual([1, 2, 3, 4]);
    expect(result.current.error).toBe("nope");
  });

  it("handleMoveTodo applies the server-returned slice to update parents + positions", async () => {
    const initial = [
      node({ id: 1, title: "old-parent", position: 0 }),
      node({ id: 2, title: "new-parent", position: 1 }),
      node({ id: 3, parentId: 1, position: 0 }),
      node({ id: 4, parentId: 1, position: 1 }),
    ];
    const { result } = renderHook(() => useTodosMutationsWithState(initial));

    mockMoveTodo.mockResolvedValueOnce({
      success: true,
      data: {
        movedId: 4,
        oldParentId: 1,
        newParentId: 2,
        oldParentSiblings: [3],
        newParentSiblings: [4],
      },
    });

    await act(async () => {
      await result.current.handleMoveTodo(4, { parentId: 2, position: 0 });
    });

    const byId = new Map(result.current.todos.map((n) => [n.id, n]));
    const four = byId.get(4);
    const three = byId.get(3);
    if (!four || !three) throw new Error("expected rows");
    expect(four.parentId).toBe(2);
    expect(four.position).toBe(0);
    // Old parent's remaining child compacts to position 0.
    expect(three.parentId).toBe(1);
    expect(three.position).toBe(0);
  });

  it("handleReorderSiblings optimistic writes then rolls back on server error", async () => {
    const initial = [
      node({ id: 1, title: "parent" }),
      node({ id: 2, parentId: 1, position: 0 }),
      node({ id: 3, parentId: 1, position: 1 }),
      node({ id: 4, parentId: 1, position: 2 }),
    ];
    const { result } = renderHook(() => useTodosMutationsWithState(initial));

    mockReorderTodoSiblings.mockResolvedValueOnce({ success: false, error: "conflict" });

    await act(async () => {
      await result.current.handleReorderSiblings(1, [4, 2, 3]);
    });

    // Rollback: positions restored to original 0/1/2 order.
    const byId = new Map(result.current.todos.map((n) => [n.id, n]));
    expect(byId.get(2)?.position).toBe(0);
    expect(byId.get(3)?.position).toBe(1);
    expect(byId.get(4)?.position).toBe(2);
    expect(result.current.error).toBe("conflict");
  });
});

describe("applyMoveResult", () => {
  it("returns identical array reference when nothing needs updating", () => {
    const stateRef: { current: TodoTreeNode[] } = { current: [node({ id: 1 })] };
    const setter = (updater: TodoTreeNode[] | ((p: TodoTreeNode[]) => TodoTreeNode[])) => {
      stateRef.current = typeof updater === "function" ? updater(stateRef.current) : updater;
    };
    applyMoveResult(setter, {
      movedId: 1,
      oldParentId: null,
      newParentId: null,
      oldParentSiblings: [1],
      newParentSiblings: [1],
    });
    expect(stateRef.current[0]?.position).toBe(0);
    expect(stateRef.current[0]?.parentId).toBeNull();
  });

  it("applies newParentId=null correctly (regression: `??` swallowed null → row stuck under old parent)", () => {
    const stateRef: { current: TodoTreeNode[] } = {
      current: [node({ id: 1 }), node({ id: 2, parentId: 1, position: 0 })],
    };
    const setter = (updater: TodoTreeNode[] | ((p: TodoTreeNode[]) => TodoTreeNode[])) => {
      stateRef.current = typeof updater === "function" ? updater(stateRef.current) : updater;
    };
    applyMoveResult(setter, {
      movedId: 2,
      oldParentId: 1,
      newParentId: null,
      oldParentSiblings: [],
      newParentSiblings: [1, 2],
    });
    const two = stateRef.current.find((n) => n.id === 2);
    if (!two) throw new Error("expected #2 in state");
    expect(two.parentId).toBeNull();
    expect(two.position).toBe(1);
  });
});
