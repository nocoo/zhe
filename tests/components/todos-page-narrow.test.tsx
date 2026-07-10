// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mockUseTodosViewModel = vi.fn();
vi.mock("@/viewmodels/useTodosViewModel", () => ({
  useTodosViewModel: (...args: unknown[]) => mockUseTodosViewModel(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

/**
 * We swap in a `matchMedia` mock so the narrow / coarse-pointer hooks
 * return deterministic values per test. happy-dom's default matchMedia
 * always returns `matches: false`, which is fine for the desktop test
 * but not for the fallback ones.
 */
type MediaListener = () => void;
type MockMediaQueryList = {
  matches: boolean;
  addEventListener: (event: string, listener: MediaListener) => void;
  removeEventListener: (event: string, listener: MediaListener) => void;
  addListener: (l: MediaListener) => void;
  removeListener: (l: MediaListener) => void;
  media: string;
  dispatchEvent: () => boolean;
  onchange: MediaListener | null;
};

function installMatchMedia(matches: (query: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MockMediaQueryList => ({
      matches: matches(query),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

const mockShellProps = vi.fn();
vi.mock(
  "@/components/dashboard/todos-page-parts/todo-tree-shell",
  () => ({
    TodoTreeShell: (props: unknown) => {
      mockShellProps(props);
      return <div data-testid="tree-shell-stub" />;
    },
  }),
);

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

const TREE = [
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
];

const FOREST = TREE.map((n) => ({ ...n, children: [] }));

const baseVm = {
  todos: TREE,
  forest: FOREST,
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
});

afterEach(() => cleanup());

describe("TodosPage — narrow viewport Sheet fallback", () => {
  it("hides the side detail pane and renders the tree full-width when narrow", () => {
    installMatchMedia((q) => q.includes("max-width"));
    mockUseTodosViewModel.mockReturnValue(baseVm);
    render(<TodosPage />);
    // Side detail section (labelled) is gone.
    expect(
      screen.queryByRole("region", { name: /Selected todo detail/i }),
    ).toBeNull();
  });

  it("opens the Sheet with detail content when a row is selected", () => {
    installMatchMedia((q) => q.includes("max-width"));
    const detail = {
      ...TREE[0],
      content: null,
      excerpt: null,
      doneAt: null,
    };
    mockUseTodosViewModel.mockReturnValue({
      ...baseVm,
      selectedId: 1,
      detail,
    });
    const { container } = render(<TodosPage />);
    // Radix Dialog portals — attribute-scoped queries on the portal root
    // work regardless of portal location.
    const sheet = container.ownerDocument.querySelector(
      "[data-todos-detail-sheet]",
    );
    expect(sheet).toBeTruthy();
    expect(sheet?.textContent).toContain("root");
  });

  it("closing the Sheet clears selectedId back to null", () => {
    installMatchMedia((q) => q.includes("max-width"));
    const vm = {
      ...baseVm,
      selectedId: 1,
      detail: { ...TREE[0], content: null, excerpt: null, doneAt: null },
    };
    mockUseTodosViewModel.mockReturnValue(vm);
    const { container } = render(<TodosPage />);
    const closeBtn = container.ownerDocument.querySelector(
      "[data-todos-detail-sheet] button[aria-label='Close'], [data-todos-detail-sheet] button[data-state]",
    );
    // Fallback: Radix's built-in close is an unlabelled button inside the
    // header — trigger onOpenChange(false) via the Escape key.
    act(() => {
      fireEvent.keyDown(container.ownerDocument.body, { key: "Escape" });
    });
    // Whether via close button or Escape, `setSelectedId(null)` must fire.
    expect(vm.setSelectedId).toHaveBeenCalledWith(null);
    // silence unused variable when the close button lookup returns null
    void closeBtn;
  });
});

describe("TodosPage — desktop viewport", () => {
  it("keeps the side detail pane and does not render the Sheet", () => {
    installMatchMedia(() => false);
    mockUseTodosViewModel.mockReturnValue(baseVm);
    const { container } = render(<TodosPage />);
    expect(
      screen.getByRole("region", { name: /Selected todo detail/i }),
    ).toBeTruthy();
    expect(
      container.ownerDocument.querySelector("[data-todos-detail-sheet]"),
    ).toBeNull();
  });
});

describe("TodosPage — coarse pointer wiring", () => {
  it("passes disableDrag=true to TodoTreeShell when the pointer is coarse", () => {
    installMatchMedia((q) => q.includes("pointer: coarse"));
    mockUseTodosViewModel.mockReturnValue(baseVm);
    render(<TodosPage />);
    // The first render uses pre-effect state (`useState(false)`); after
    // matchMedia commits, TodoTreeShell rerenders with the true value.
    // Assert against the *latest* captured call rather than the first.
    const calls = mockShellProps.mock.calls;
    const lastCall = calls[calls.length - 1]?.[0] as
      | { disableDrag?: boolean }
      | undefined;
    expect(lastCall?.disableDrag).toBe(true);
  });

  it("passes disableDrag=false when the pointer is fine (desktop)", () => {
    installMatchMedia(() => false);
    mockUseTodosViewModel.mockReturnValue(baseVm);
    render(<TodosPage />);
    const calls = mockShellProps.mock.calls;
    const lastCall = calls[calls.length - 1]?.[0] as
      | { disableDrag?: boolean }
      | undefined;
    expect(lastCall?.disableDrag).toBe(false);
  });
});
