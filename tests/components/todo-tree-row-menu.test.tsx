// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodoForestNode } from "@/models/todos";
import { TodoTreeRow } from "@/components/dashboard/todos-page-parts/todo-tree-row";

afterEach(() => cleanup());

/**
 * TodoTreeRow is normally rendered by react-arborist which supplies a
 * `NodeApi`; here we fabricate a minimal lookalike so we can drive
 * `isEditing`, `isInternal`, `isOpen` and callback behaviour without
 * spinning up a real tree.
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

describe("TodoTreeRow — row menu", () => {
  it("closes the dropdown after a menu action (Add child) fires", async () => {
    const user = userEvent.setup();
    const { node, data } = makeNode();
    const onAddChild = vi.fn();
    render(
      <TodoTreeRow
        node={node as never}
        style={{}}
        dragHandle={() => {}}
        tree={undefined as never}
        selectedId={null}
        onSelect={vi.fn()}
        onToggleDone={vi.fn()}
        onRename={vi.fn()}
        onAddChild={onAddChild}
        onAddSibling={vi.fn()}
        onConfirmDelete={vi.fn()}
        onEditEmoji={vi.fn()}
      />,
    );

    // Open the row menu.
    await user.click(
      screen.getByRole("button", { name: `Row menu for ${data.title}` }),
    );
    const menuItem = await screen.findByText(/添加子项/);
    await user.click(menuItem);
    expect(onAddChild).toHaveBeenCalledWith(data.id);

    // Regression: after selecting the action, the dropdown must close.
    // A previous version passed `preventDefault()` to `onSelect`, which
    // told Radix to keep the menu open — that left the trigger + menu +
    // any downstream dialog focused in a broken state.
    await waitFor(() =>
      expect(screen.queryByText(/添加子项/)).toBeNull(),
    );
  });

  it("Delete… menu action still fires and lets Radix close the menu", async () => {
    const user = userEvent.setup();
    const { node, data } = makeNode();
    const onConfirmDelete = vi.fn();
    render(
      <TodoTreeRow
        node={node as never}
        style={{}}
        dragHandle={() => {}}
        tree={undefined as never}
        selectedId={null}
        onSelect={vi.fn()}
        onToggleDone={vi.fn()}
        onRename={vi.fn()}
        onAddChild={vi.fn()}
        onAddSibling={vi.fn()}
        onConfirmDelete={onConfirmDelete}
        onEditEmoji={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: `Row menu for ${data.title}` }),
    );
    const deleteItem = await screen.findByText(/删除…/);
    await user.click(deleteItem);
    expect(onConfirmDelete).toHaveBeenCalledWith(data);
    await waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: /删除…/ })).toBeNull(),
    );
  });

  it("right-click on the row opens the context menu with the same items", async () => {
    const { node, data } = makeNode();
    const onConfirmDelete = vi.fn();
    render(
      <TodoTreeRow
        node={node as never}
        style={{}}
        dragHandle={() => {}}
        tree={undefined as never}
        selectedId={null}
        onSelect={vi.fn()}
        onToggleDone={vi.fn()}
        onRename={vi.fn()}
        onAddChild={vi.fn()}
        onAddSibling={vi.fn()}
        onConfirmDelete={onConfirmDelete}
        onEditEmoji={vi.fn()}
      />,
    );

    const row = document.querySelector(`[data-todo-row="${data.id}"]`);
    if (!row) throw new Error("expected treeitem row");

    // Radix ContextMenu opens on a native "contextmenu" event with button=2.
    fireEvent.contextMenu(row, { button: 2 });

    // The four menu items from RowMenuItems must all render under the
    // context menu just like the dropdown menu.
    for (const label of [/添加子项/, /添加同级/, /修改 emoji/, /删除…/]) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
  });
});
