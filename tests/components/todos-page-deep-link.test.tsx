// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for `TodosPage` selection seeding from `?id=N`
 * (Global Search deep-link, docs/21-todos-feature.md — Global Search).
 *
 * We control the `useSearchParams()` return by rerendering with a fresh
 * mock instance each time, so the hook re-reads the value and the
 * `lastAppliedId` ref in the page can be exercised.
 */

const mockUseTodosViewModel = vi.fn();
vi.mock("@/viewmodels/useTodosViewModel", () => ({
  useTodosViewModel: (...args: unknown[]) => mockUseTodosViewModel(...args),
}));

let currentIdParam: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === "id" ? currentIdParam : null),
  }),
}));

vi.mock("react-arborist", () => ({
  Tree: ({
    data,
    children,
  }: {
    data: Array<{ id: number; title: string; children: unknown[] }>;
    children: (props: unknown) => ReactElement;
  }) => (
    <ul data-testid="mock-tree">
      {data.map((node) =>
        children({
          node: {
            id: String(node.id),
            data: node,
            isInternal: false,
            isOpen: false,
            isEditing: false,
            toggle: () => {},
            edit: () => {},
            reset: () => {},
          },
          style: {},
          dragHandle: () => {},
        }),
      )}
    </ul>
  ),
}));

import { TodosPage } from "@/components/dashboard/todos-page";

const baseVm = {
  todos: [],
  forest: [],
  loading: false,
  isSaving: false,
  isDeleting: false,
  error: null,
  clearError: vi.fn(),
  searchQuery: "",
  setSearchQuery: vi.fn(),
  showDone: true,
  setShowDone: vi.fn(),
  selectedTagName: null,
  setSelectedTagName: vi.fn(),
  dueFilter: "all",
  setDueFilter: vi.fn(),
  tagFilterOptions: [],
  clearFilters: vi.fn(),
  selectedId: null as number | null,
  setSelectedId: vi.fn(),
  detail: null,
  detailLoading: false,
  handleCreateTodo: vi.fn(),
  handleUpdateTodo: vi.fn(),
  handleMoveTodo: vi.fn(),
  handleReorderSiblings: vi.fn(),
  handleDeleteTodo: vi.fn(),
  isDeleteConfirmOpen: false,
  todoToDelete: null,
  confirmDelete: vi.fn(),
  cancelDelete: vi.fn(),
  executeDelete: vi.fn(),
  refreshTodos: vi.fn(),
  onArboristMove: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  currentIdParam = null;
});
afterEach(() => cleanup());

describe("TodosPage — Global Search deep-link", () => {
  it("seeds selection from a valid ?id=N on mount", () => {
    currentIdParam = "42";
    const vm = { ...baseVm };
    mockUseTodosViewModel.mockReturnValue(vm);
    render(<TodosPage />);
    expect(vm.setSelectedId).toHaveBeenCalledWith(42);
  });

  it("ignores non-numeric or non-positive ?id values without touching selection", () => {
    for (const bad of ["abc", "0", "-3", "1.5", ""]) {
      currentIdParam = bad;
      const vm = { ...baseVm, setSelectedId: vi.fn() };
      mockUseTodosViewModel.mockReturnValue(vm);
      const rendered = render(<TodosPage />);
      expect(vm.setSelectedId, `bad value ${JSON.stringify(bad)}`).not.toHaveBeenCalled();
      rendered.unmount();
    }
  });

  it("does not re-apply the same ?id when the page re-renders", () => {
    currentIdParam = "7";
    const vm = { ...baseVm, setSelectedId: vi.fn() };
    mockUseTodosViewModel.mockReturnValue(vm);
    const { rerender } = render(<TodosPage />);
    expect(vm.setSelectedId).toHaveBeenCalledTimes(1);
    // Simulate the user manually selecting another row (VM's selectedId
    // moves to 99) and the page re-rendering.
    mockUseTodosViewModel.mockReturnValue({ ...vm, selectedId: 99 });
    rerender(<TodosPage />);
    // The effect must NOT overwrite the manual selection just because
    // the search param string is unchanged.
    expect(vm.setSelectedId).toHaveBeenCalledTimes(1);
  });

  it("re-applies when the ?id query string genuinely changes", () => {
    currentIdParam = "7";
    const vm = { ...baseVm, setSelectedId: vi.fn() };
    mockUseTodosViewModel.mockReturnValue(vm);
    const { rerender } = render(<TodosPage />);
    expect(vm.setSelectedId).toHaveBeenLastCalledWith(7);

    currentIdParam = "8";
    rerender(<TodosPage />);
    expect(vm.setSelectedId).toHaveBeenLastCalledWith(8);
    expect(vm.setSelectedId).toHaveBeenCalledTimes(2);
  });
});
