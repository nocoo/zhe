// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetTodos = vi.fn();
const mockGetTodo = vi.fn();
const mockCreateTodo = vi.fn();
const mockUpdateTodo = vi.fn();
const mockDeleteTodo = vi.fn();
const mockMoveTodo = vi.fn();
const mockReorderTodoSiblings = vi.fn();

vi.mock("@/actions/todos", () => ({
  getTodos: (...args: unknown[]) => mockGetTodos(...args),
  getTodo: (...args: unknown[]) => mockGetTodo(...args),
  createTodo: (...args: unknown[]) => mockCreateTodo(...args),
  updateTodo: (...args: unknown[]) => mockUpdateTodo(...args),
  deleteTodo: (...args: unknown[]) => mockDeleteTodo(...args),
  moveTodo: (...args: unknown[]) => mockMoveTodo(...args),
  reorderTodoSiblings: (...args: unknown[]) => mockReorderTodoSiblings(...args),
}));

import { useTodosViewModel } from "@/viewmodels/useTodosViewModel";

const TREE = [
  {
    id: 1,
    parentId: null,
    position: 0,
    title: "root",
    done: false,
    hasContent: false,
    excerpt: null,
    tagNames: ["work"],
    dueAt: null,
    emoji: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
  {
    id: 2,
    parentId: 1,
    position: 0,
    title: "child",
    done: false,
    hasContent: false,
    excerpt: null,
    tagNames: [],
    dueAt: null,
    emoji: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTodos.mockResolvedValue({ success: true, data: TREE });
});

describe("useTodosViewModel", () => {
  it("fetches todos on mount and derives the forest", async () => {
    const { result } = renderHook(() => useTodosViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.todos).toHaveLength(2);
    expect(result.current.forest).toHaveLength(1);
    expect(result.current.forest[0]?.children).toHaveLength(1);
  });

  it("lazily fetches detail when a row is selected and clears on deselect", async () => {
    const detail = { ...TREE[0], content: "# hi", excerpt: "hi", doneAt: null };
    mockGetTodo.mockResolvedValueOnce({ success: true, data: detail });

    const { result } = renderHook(() => useTodosViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSelectedId(1));
    await waitFor(() => expect(result.current.detail?.id).toBe(1));
    expect(mockGetTodo).toHaveBeenCalledWith(1);

    act(() => result.current.setSelectedId(null));
    await waitFor(() => expect(result.current.detail).toBeNull());
  });

  it("confirmDelete → executeDelete deletes and clears selection when the deleted row was selected", async () => {
    mockDeleteTodo.mockResolvedValueOnce({ success: true });
    const { result } = renderHook(() => useTodosViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const root = TREE[0];
    if (!root) throw new Error("test fixture missing");

    // Simulate that the user had the row selected first.
    act(() => result.current.setSelectedId(1));
    act(() => result.current.confirmDelete(root));

    await act(async () => {
      await result.current.executeDelete();
    });

    expect(mockDeleteTodo).toHaveBeenCalledWith(1);
    expect(result.current.isDeleteConfirmOpen).toBe(false);
    expect(result.current.selectedId).toBeNull();
  });

  it("cascade delete clears selection even when the selected row is a descendant of the deleted one", async () => {
    // Regression for Reviewer round-1 blocker #3. When the user deletes
    // the parent while a child is selected, the FK-cascade drops the
    // child too — leaving `selectedId` pointing at a ghost. The VM must
    // detect that selectedId lives inside the doomed subtree and clear it.
    mockDeleteTodo.mockResolvedValueOnce({ success: true });
    const { result } = renderHook(() => useTodosViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const root = TREE[0];
    if (!root) throw new Error("test fixture missing");

    act(() => result.current.setSelectedId(2)); // the child of #1
    act(() => result.current.confirmDelete(root)); // delete parent #1

    await act(async () => {
      await result.current.executeDelete();
    });

    expect(mockDeleteTodo).toHaveBeenCalledWith(1);
    expect(result.current.selectedId).toBeNull();
    // And both rows are gone from local state (optimistic drop applied).
    expect(result.current.todos.map((n) => n.id)).toEqual([]);
  });

  it("deselecting mid-fetch clears detailLoading and never leaks the late detail into state", async () => {
    // Regression for Reviewer round-1 blocker #2. A pending getTodo whose
    // requestor deselects before it resolves used to leave detailLoading
    // stuck at true. It must (a) clear detailLoading immediately on
    // deselect, and (b) drop the late response instead of writing it.
    let resolvePending: ((value: unknown) => void) | undefined;
    mockGetTodo.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolvePending = res;
        }),
    );

    const { result } = renderHook(() => useTodosViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSelectedId(1));
    // Loading is on while the fetch pends.
    await waitFor(() => expect(result.current.detailLoading).toBe(true));

    // User deselects before the promise resolves.
    act(() => result.current.setSelectedId(null));
    expect(result.current.detailLoading).toBe(false);
    expect(result.current.detail).toBeNull();

    // Now the stale request finally resolves. It must NOT flip detail
    // back on and must NOT re-arm the loading flag.
    await act(async () => {
      resolvePending?.({
        success: true,
        data: { ...TREE[0], content: null, excerpt: null, doneAt: null },
      });
    });
    expect(result.current.detail).toBeNull();
    expect(result.current.detailLoading).toBe(false);
  });

  it("handles initial fetch failure and refreshTodos failure or success", async () => {
    // Initial fetch failure
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetTodos.mockRejectedValueOnce(new Error("fetch error"));
    const { result } = renderHook(() => useTodosViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.todos).toEqual([]);

    // refreshTodos success
    mockGetTodos.mockResolvedValueOnce({ success: true, data: TREE });
    await act(async () => {
      await result.current.refreshTodos();
    });
    expect(result.current.todos).toHaveLength(2);

    // refreshTodos failure (e.g. success: false)
    mockGetTodos.mockResolvedValueOnce({ success: false });
    await act(async () => {
      await result.current.refreshTodos();
    });
    expect(result.current.todos).toHaveLength(2);
    consoleError.mockRestore();
  });

  it("handles getTodo failure or empty data by setting detail to null", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useTodosViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // getTodo returns success: false
    mockGetTodo.mockResolvedValueOnce({ success: false });
    act(() => result.current.setSelectedId(1));
    await waitFor(() => expect(result.current.detailLoading).toBe(false));
    expect(result.current.detail).toBeNull();

    // getTodo throws error
    mockGetTodo.mockRejectedValueOnce(new Error("network"));
    act(() => result.current.setSelectedId(2));
    await waitFor(() => expect(result.current.detailLoading).toBe(false));
    expect(result.current.detail).toBeNull();
    consoleError.mockRestore();
  });

  it("supports deleteConfirm cancelDelete and executeDelete without selected target", async () => {
    const { result } = renderHook(() => useTodosViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const root = TREE[0];
    if (!root) throw new Error("test fixture missing");

    act(() => result.current.confirmDelete(root));
    expect(result.current.isDeleteConfirmOpen).toBe(true);
    expect(result.current.todoToDelete?.id).toBe(root.id);

    act(() => result.current.cancelDelete());
    expect(result.current.isDeleteConfirmOpen).toBe(false);
    expect(result.current.todoToDelete).toBeNull();

    await act(async () => {
      await result.current.executeDelete();
    });
    expect(mockDeleteTodo).not.toHaveBeenCalled();
  });

  it("drops late initial fetch response after unmount without updating state", async () => {
    let resolveInitial: ((value: unknown) => void) | undefined;
    mockGetTodos.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveInitial = res;
        }),
    );
    const { result, unmount } = renderHook(() => useTodosViewModel());
    expect(result.current.loading).toBe(true);
    unmount();
    await act(async () => {
      resolveInitial?.({ success: true, data: TREE });
    });
    expect(result.current.todos).toEqual([]);
  });
});
