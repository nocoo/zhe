// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TodoDeleteConfirm } from "@/components/dashboard/todos-page-parts/todo-delete-confirm";

afterEach(() => cleanup());

describe("TodoDeleteConfirm", () => {
  it("shows descendant count when the todo has children", () => {
    render(
      <TodoDeleteConfirm
        open
        onOpenChange={() => {}}
        todoTitle="Grocery list"
        descendantCount={3}
        onConfirm={() => {}}
        isDeleting={false}
      />,
    );
    // Docs rule: body must include "N descendants" when N > 0.
    const body = screen.getByText(/Grocery list.*3 descendants/i);
    expect(body).toBeTruthy();
  });

  it("uses the singular form for exactly one descendant", () => {
    render(
      <TodoDeleteConfirm
        open
        onOpenChange={() => {}}
        todoTitle="Solo parent"
        descendantCount={1}
        onConfirm={() => {}}
        isDeleting={false}
      />,
    );
    expect(screen.getByText(/1 descendant\b/)).toBeTruthy();
  });

  it("omits the descendant clause when count is zero", () => {
    render(
      <TodoDeleteConfirm
        open
        onOpenChange={() => {}}
        todoTitle="Leaf"
        descendantCount={0}
        onConfirm={() => {}}
        isDeleting={false}
      />,
    );
    expect(screen.getByText(/^Delete “Leaf”\?/)).toBeTruthy();
  });

  it("falls back to `Untitled` when the row has no title", () => {
    render(
      <TodoDeleteConfirm
        open
        onOpenChange={() => {}}
        todoTitle={null}
        descendantCount={0}
        onConfirm={() => {}}
        isDeleting={false}
      />,
    );
    expect(screen.getByText(/^Delete “Untitled”\?/)).toBeTruthy();
  });
});
