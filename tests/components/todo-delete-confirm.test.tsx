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
    const body = screen.getByText(/Grocery list.*3 项子任务/);
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
    // Chinese has no plural form; the singular / plural formatting collapses
    // to the same "N 项子任务" wording.
    expect(screen.getByText(/1 项子任务/)).toBeTruthy();
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
    expect(screen.getByText(/^确认删除“Leaf”？/)).toBeTruthy();
  });

  it("falls back to `未命名` when the row has no title", () => {
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
    expect(screen.getByText(/^确认删除“未命名”？/)).toBeTruthy();
  });
});
