// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardState } from "@/contexts/dashboard-service";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { unoptimized: _u, fill: _f, ...rest } = props;
    return <img {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} />;
  },
}));

const mockState: DashboardState = {
  links: [],
  folders: [],
  tags: [],
  linkTags: [],
  ideas: [],
  todos: [],
  loading: false,
  ideasLoading: false,
  todosLoading: false,
  siteUrl: "https://zhe.to",
};
const mockEnsureIdeasLoaded = vi.fn();
const mockEnsureTodosLoaded = vi.fn();
vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardState: () => mockState,
  useDashboardActions: () => ({
    ensureIdeasLoaded: mockEnsureIdeasLoaded,
    ensureTodosLoaded: mockEnsureTodosLoaded,
  }),
}));

vi.mock("@/models/tags", () => ({
  getTagStyles: (name: string) => ({
    badge: { backgroundColor: `mock-bg-${name}`, color: `mock-color-${name}` },
    dot: { backgroundColor: `mock-dot-${name}` },
  }),
}));

import { SearchCommandDialog } from "@/components/search-command-dialog";

function renderDialog(open = true) {
  return render(<SearchCommandDialog open={open} onOpenChange={vi.fn()} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.todos = [];
});
afterEach(() => cleanup());

const TODO_ONE = {
  id: 42,
  parentId: null,
  position: 0,
  title: "Buy Milk",
  done: false,
  hasContent: false,
  excerpt: null,
  tagNames: ["shopping"],
  dueAt: null,
  emoji: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const TODO_DONE = {
  ...TODO_ONE,
  id: 43,
  title: "Read book",
  done: true,
  tagNames: [],
};

describe("SearchCommandDialog — todos group", () => {
  it("calls ensureTodosLoaded when the dialog opens", () => {
    renderDialog(true);
    expect(mockEnsureTodosLoaded).toHaveBeenCalled();
  });

  it("renders a 待办 group with matching rows and routes selection to the todos page", async () => {
    mockState.todos = [TODO_ONE, TODO_DONE];
    renderDialog();
    const input = screen.getByPlaceholderText("搜索链接、想法、待办 · 跳转页面 · 触发动作...");
    fireEvent.change(input, { target: { value: "milk" } });
    await waitFor(() => expect(screen.getByText(/待办 \(1\)/)).toBeInTheDocument());
    // Selecting the todo item routes to /dashboard/todos?id=42.
    const item = document.querySelector('[cmdk-item][data-value="todo-42"]');
    if (!item) throw new Error("expected todo cmdk-item");
    fireEvent.click(item);
    expect(mockPush).toHaveBeenCalledWith("/dashboard/todos?id=42");
  });

  it("shows only substring matches (does NOT pull in ancestors like filterTodos does)", async () => {
    const parent = {
      ...TODO_ONE,
      id: 1,
      title: "Personal projects",
      tagNames: [],
    };
    const child = {
      ...TODO_ONE,
      id: 2,
      parentId: 1,
      title: "Buy Milk",
    };
    mockState.todos = [parent, child];
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText("搜索链接、想法、待办 · 跳转页面 · 触发动作..."), {
      target: { value: "milk" },
    });
    await waitFor(() => expect(screen.getByText(/待办 \(1\)/)).toBeInTheDocument());
    // Only the direct match renders — the ancestor is not shown as a
    // flat search result even though filterTodos preserves it in tree
    // mode.
    expect(document.querySelector('[cmdk-item][data-value="todo-2"]')).toBeTruthy();
    expect(document.querySelector('[cmdk-item][data-value="todo-1"]')).toBeNull();
  });

  it("does not render the group when nothing matches", async () => {
    mockState.todos = [TODO_ONE];
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText("搜索链接、想法、待办 · 跳转页面 · 触发动作..."), {
      target: { value: "nomatch" },
    });
    await waitFor(() => expect(screen.queryByText(/待办 \(/)).toBeNull());
    expect(screen.getByText("没有找到匹配的结果")).toBeInTheDocument();
  });

  it("shows the done row with a line-through class", async () => {
    mockState.todos = [TODO_DONE];
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText("搜索链接、想法、待办 · 跳转页面 · 触发动作..."), {
      target: { value: "read" },
    });
    await waitFor(() => expect(screen.getByText(/待办 \(1\)/)).toBeInTheDocument());
    const item = document.querySelector('[cmdk-item][data-value="todo-43"]');
    if (!item) throw new Error("expected done todo item");
    expect(item.innerHTML).toContain("line-through");
  });

  it("matches on excerpt as well as title (docs contract: title + excerpt)", async () => {
    // Regression for Reviewer round-1: docs/21-todos-feature.md — "Global
    // Search" pins match on title + excerpt. Title-only would silently
    // drop todos whose notes matched the query.
    const noteHit = {
      ...TODO_ONE,
      id: 99,
      title: "Plan trip", // does NOT contain "iceland"
      excerpt: "Book flights to Iceland and pack for cold weather",
    };
    mockState.todos = [noteHit];
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText("搜索链接、想法、待办 · 跳转页面 · 触发动作..."), {
      target: { value: "iceland" },
    });
    await waitFor(() => expect(screen.getByText(/待办 \(1\)/)).toBeInTheDocument());
    const item = document.querySelector('[cmdk-item][data-value="todo-99"]');
    expect(item).toBeTruthy();
    // Selecting still deep-links to /dashboard/todos?id=99.
    if (item) fireEvent.click(item);
    expect(mockPush).toHaveBeenCalledWith("/dashboard/todos?id=99");
  });
});
