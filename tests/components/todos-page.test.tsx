// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * The composition VM is intercepted here so we can drive the page's
 * loaded / empty / loaded-with-error states from the outside without
 * spinning up server actions. `react-arborist` is also stubbed to a
 * dumb list renderer — otherwise happy-dom's DOM layout would need to
 * fake a virtualised window, which is out of scope for this smoke test.
 */

const mockUseTodosViewModel = vi.fn();
vi.mock("@/viewmodels/useTodosViewModel", () => ({
  useTodosViewModel: (...args: unknown[]) => mockUseTodosViewModel(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("react-arborist", () => ({
  // Minimal <Tree> stub: renders each root node with its title so the
  // smoke test can assert the flat list rendered without arborist's DnD
  // virtualiser leaking into the test environment.
  Tree: ({
    data,
    children,
  }: {
    data: Array<{ id: number; title: string; children: unknown[] }>;
    children: (props: unknown) => ReactElement;
  }) => (
    <ul data-testid="mock-tree">
      {data.map((node) =>
        // We hand the child renderer a minimal NodeApi lookalike; the
        // page-level smoke test does not exercise chevron/edit/menu logic
        // (those live in the row-level unit tests).
        children({
          node: {
            id: String(node.id),
            data: node,
            isInternal: (node.children ?? []).length > 0,
            isOpen: true,
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
  selectedId: null,
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
});

afterEach(() => cleanup());

describe("TodosPage", () => {
  it("renders the loading state when the VM is fetching todos", () => {
    mockUseTodosViewModel.mockReturnValue({ ...baseVm, loading: true });
    render(<TodosPage />);
    expect(screen.getByText(/Loading todos…/)).toBeTruthy();
  });

  it("renders the empty state when there are no todos", () => {
    mockUseTodosViewModel.mockReturnValue(baseVm);
    render(<TodosPage />);
    expect(screen.getByText(/No todos yet/)).toBeTruthy();
    // Empty-state CTA fires the composition's createTodo.
    fireEvent.click(screen.getByRole("button", { name: /create root/i }));
    expect(baseVm.handleCreateTodo).toHaveBeenCalled();
  });

  it("renders the tree when todos are present", () => {
    mockUseTodosViewModel.mockReturnValue({
      ...baseVm,
      todos: [
        {
          id: 1,
          parentId: null,
          position: 0,
          title: "root",
          done: false,
          hasContent: false,
          excerpt: null,
          tagNames: [],
          dueAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
      forest: [
        {
          id: 1,
          parentId: null,
          position: 0,
          title: "root",
          done: false,
          hasContent: false,
          excerpt: null,
          tagNames: [],
          dueAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
          children: [],
        },
      ],
    });
    render(<TodosPage />);
    expect(screen.getByTestId("mock-tree")).toBeTruthy();
    expect(screen.getByText("root")).toBeTruthy();
  });

  it("surfaces the VM error in a dismissible banner", () => {
    const vm = { ...baseVm, error: "boom" };
    mockUseTodosViewModel.mockReturnValue(vm);
    render(<TodosPage />);
    expect(screen.getByRole("alert").textContent).toContain("boom");
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(vm.clearError).toHaveBeenCalled();
  });

  it("renders the delete-confirm dialog when the VM flags it open with a subtree count", () => {
    mockUseTodosViewModel.mockReturnValue({
      ...baseVm,
      isDeleteConfirmOpen: true,
      todoToDelete: {
        id: 5,
        parentId: null,
        position: 0,
        title: "Grocery list",
        done: false,
        hasContent: false,
        excerpt: null,
        tagNames: [],
        dueAt: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      todos: [
        {
          id: 5,
          parentId: null,
          position: 0,
          title: "Grocery list",
          done: false,
          hasContent: false,
          excerpt: null,
          tagNames: [],
          dueAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
        {
          id: 6,
          parentId: 5,
          position: 0,
          title: "Milk",
          done: false,
          hasContent: false,
          excerpt: null,
          tagNames: [],
          dueAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
    });
    render(<TodosPage />);
    // "Grocery list … 1 descendant" — subtree count of 1 with the singular.
    expect(screen.getByText(/Grocery list.*1 descendant\b/i)).toBeTruthy();
  });
});
