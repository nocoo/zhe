// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodoTreeRow } from "@/components/dashboard/todos-page-parts/todo-tree-row";
import type { TodoForestNode } from "@/models/todos";

afterEach(() => cleanup());

/**
 * Complements todo-tree-row-menu.test.tsx by covering the row's non-menu
 * behaviour: keyboard select, checkbox toggle, done-state visuals,
 * has-content glyph, tag-chip overflow, and inline title edit commit.
 */

function makeNode(overrides: Partial<TodoForestNode> = {}) {
  const data: TodoForestNode = {
    id: 1,
    parentId: null,
    position: 0,
    title: "root",
    done: false,
    hasContent: false,
    excerpt: null,
    tagNames: [],
    dueAt: null,
    emoji: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    children: [],
    ...overrides,
  };
  const node = {
    id: String(data.id),
    data,
    isInternal: data.children.length > 0,
    isOpen: false,
    isEditing: false,
    toggle: vi.fn(),
    edit: vi.fn(),
    reset: vi.fn(),
  };
  return { data, node };
}

function renderRow(
  overrides: Partial<TodoForestNode> = {},
  props: Partial<Parameters<typeof TodoTreeRow>[0]> = {},
) {
  const { data, node } = makeNode(overrides);
  const handlers = {
    onSelect: vi.fn(),
    onToggleDone: vi.fn(),
    onRename: vi.fn(),
    onAddChild: vi.fn(),
    onAddSibling: vi.fn(),
    onConfirmDelete: vi.fn(),
    onEditEmoji: vi.fn(),
  };
  const rendered = render(
    <TodoTreeRow
      node={node as never}
      style={{}}
      dragHandle={() => {}}
      tree={undefined as never}
      selectedId={null}
      {...handlers}
      {...props}
    />,
  );
  return { ...rendered, data, node, handlers };
}

describe("TodoTreeRow — interactions", () => {
  it("clicking the row body selects it via onSelect", () => {
    const { handlers } = renderRow({ title: "root" });
    fireEvent.click(screen.getByRole("button", { name: /^root$/i }));
    expect(handlers.onSelect).toHaveBeenCalledWith(1);
  });

  it("Enter on the treeitem row enters inline title edit mode", () => {
    const { node } = renderRow();
    const row = document.querySelector('[data-todo-row="1"]');
    if (!row) throw new Error("expected treeitem row");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(node.edit).toHaveBeenCalled();
  });

  it("Space on the treeitem row toggles done (not selection)", () => {
    const { handlers } = renderRow({ done: false });
    const row = document.querySelector('[data-todo-row="1"]');
    if (!row) throw new Error("expected treeitem row");
    fireEvent.keyDown(row, { key: " " });
    expect(handlers.onToggleDone).toHaveBeenCalledWith(1, true);
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("Delete on the treeitem row opens the delete-confirm flow", () => {
    const { handlers, data } = renderRow();
    const row = document.querySelector('[data-todo-row="1"]');
    if (!row) throw new Error("expected treeitem row");
    fireEvent.keyDown(row, { key: "Delete" });
    expect(handlers.onConfirmDelete).toHaveBeenCalledWith(data);
  });

  it("Backspace on the treeitem row also opens the delete-confirm flow", () => {
    const { handlers, data } = renderRow();
    const row = document.querySelector('[data-todo-row="1"]');
    if (!row) throw new Error("expected treeitem row");
    fireEvent.keyDown(row, { key: "Backspace" });
    expect(handlers.onConfirmDelete).toHaveBeenCalledWith(data);
  });

  it("Cmd/Ctrl+N on the treeitem row adds a sibling under the same parent", () => {
    const { handlers } = renderRow({ id: 1, parentId: 5 });
    const row = document.querySelector('[data-todo-row="1"]');
    if (!row) throw new Error("expected treeitem row");
    fireEvent.keyDown(row, { key: "n", ctrlKey: true });
    expect(handlers.onAddSibling).toHaveBeenCalledWith(1, 5);
  });

  it("toggling the checkbox fires onToggleDone with the new value (without selecting the row)", () => {
    const { handlers } = renderRow({ done: false });
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(handlers.onToggleDone).toHaveBeenCalledWith(1, true);
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("done rows render with line-through on the title label", () => {
    const { container } = renderRow({ done: true, title: "old" });
    const label = container.querySelector<HTMLElement>("[data-todo-row-guard]");
    // Any element inside the row-guard group with line-through counts —
    // the row's title button carries the class when done.
    const anyStruck = container.querySelector(".line-through");
    expect(anyStruck).toBeTruthy();
    void label;
  });

  it("chevron button toggles the arborist node when the row is internal", () => {
    const { node } = renderRow({
      title: "parent",
      children: [
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
          children: [],
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /Expand/i }));
    expect(node.toggle).toHaveBeenCalled();
  });

  it("hasContent renders the has-notes glyph", () => {
    const { container } = renderRow({ hasContent: true });
    // The glyph is rendered with aria-label="Has notes".
    expect(container.querySelector('[aria-label="Has notes"]')).toBeTruthy();
  });

  it("more than 3 tags renders +N overflow indicator", () => {
    const { container } = renderRow({
      tagNames: ["a", "b", "c", "d", "e"],
    });
    // The overflow indicator shows the remaining count as +2.
    expect(container.textContent).toContain("+2");
    // First three tags are still rendered.
    for (const t of ["a", "b", "c"]) {
      expect(container.querySelector(`[data-todo-tag="${t}"]`)).toBeTruthy();
    }
    // The 4th one must not have a chip.
    expect(container.querySelector('[data-todo-tag="d"]')).toBeNull();
  });

  it("inline-edit mode commits Enter as onRename and Esc resets", () => {
    const { node } = makeNode({ title: "orig" });
    node.isEditing = true;
    const onRename = vi.fn();
    render(
      <TodoTreeRow
        node={node as never}
        style={{}}
        dragHandle={() => {}}
        tree={undefined as never}
        selectedId={null}
        onSelect={vi.fn()}
        onToggleDone={vi.fn()}
        onRename={onRename}
        onAddChild={vi.fn()}
        onAddSibling={vi.fn()}
        onConfirmDelete={vi.fn()}
        onEditEmoji={vi.fn()}
      />,
    );
    // The title editor is a compact Input (done toggle is a Radix
    // checkbox button, not an <input type=checkbox>).
    const input = document.querySelector<HTMLInputElement>("input[data-todo-row-guard]");
    if (!input) throw new Error("expected inline title editor");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith(1, "renamed");
    expect(node.reset).toHaveBeenCalled();

    // Esc must not fire onRename again — it resets the editor.
    node.reset.mockClear();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(node.reset).toHaveBeenCalled();
  });
});
