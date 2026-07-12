// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TodoDetail } from "@/lib/db/scoped";
import { TodoDetailPane } from "@/components/dashboard/todos-page-parts/todo-detail-pane";

afterEach(() => cleanup());

function makeDetail(overrides: Partial<TodoDetail> = {}): TodoDetail {
  return {
    id: 1,
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
    content: null,
    doneAt: null,
    ...overrides,
  };
}

describe("TodoDetailPane — title editing", () => {
  it("bounces the title state back to server truth when the user clears it", () => {
    // Regression for Reviewer round-1 blocker #2. Clearing the title and
    // blurring must not leave the pane with an empty title (the server
    // rejects empty titles, so a stale empty draft would misrepresent
    // the actual todo).
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail()}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    const input = screen.getByLabelText("Todo title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    expect(input.value).toBe("   ");
    fireEvent.blur(input);
    // No mutation fired…
    expect(onUpdate).not.toHaveBeenCalled();
    // …and the local state was reset to the server-truth title.
    expect(input.value).toBe("Grocery list");
  });

  it("commits a real change on blur (existing behaviour)", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail()}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    const input = screen.getByLabelText("Todo title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Weekend shopping" } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith(1, { title: "Weekend shopping" });
  });

  it("normalises stray leading/trailing whitespace to the trimmed form without firing an update", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail()}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    const input = screen.getByLabelText("Todo title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Grocery list  " } });
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(input.value).toBe("Grocery list");
  });
});

describe("TodoDetailPane — empty state", () => {
  it("renders a placeholder when detail is null", () => {
    render(
      <TodoDetailPane
        detail={null}
        detailLoading={false}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText(/选择一条待办/)).toBeTruthy();
  });

  it("renders a loading indicator when detail is null and detailLoading is true", () => {
    render(
      <TodoDetailPane
        detail={null}
        detailLoading={true}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText(/加载中…/)).toBeTruthy();
  });
});

describe("TodoDetailPane — due date", () => {
  it("editing the date input commits the local end-of-day epoch ms", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail()}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    const dateInput = screen.getByLabelText("Due date") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-07-15" } });
    fireEvent.blur(dateInput);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const call = onUpdate.mock.calls[0];
    expect(call?.[0]).toBe(1);
    const patch = call?.[1] as { dueAtMs?: number | null };
    // Local EOD 2026-07-15 = new Date(2026, 6, 15, 23, 59, 59, 999)
    const expected = new Date(2026, 6, 15, 23, 59, 59, 999).getTime();
    expect(patch.dueAtMs).toBe(expected);
  });

  it("Clear button clears the due date via a null dueAtMs patch", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail({ dueAt: new Date(2026, 6, 15, 23, 59, 59, 999) })}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /清除/ }));
    expect(onUpdate).toHaveBeenCalledWith(1, { dueAtMs: null });
  });
});

describe("TodoDetailPane — tags", () => {
  it("Add tag input commits a normalised tag on Enter and clears the draft", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail({ tagNames: ["home"] })}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    const addInput = screen.getByLabelText("Add tag") as HTMLInputElement;
    fireEvent.change(addInput, { target: { value: "  Work  " } });
    fireEvent.keyDown(addInput, { key: "Enter" });
    expect(onUpdate).toHaveBeenCalledWith(1, { tagNames: ["home", "work"] });
    expect(addInput.value).toBe("");
  });

  it("Duplicate tag entries are silently dropped (input clears, no update)", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail({ tagNames: ["work"] })}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    const addInput = screen.getByLabelText("Add tag") as HTMLInputElement;
    fireEvent.change(addInput, { target: { value: "Work" } });
    fireEvent.keyDown(addInput, { key: "Enter" });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(addInput.value).toBe("");
  });

  it("Removing a tag chip fires an update without the removed name", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail({ tagNames: ["home", "work"] })}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove tag work"));
    expect(onUpdate).toHaveBeenCalledWith(1, { tagNames: ["home"] });
  });
});

describe("TodoDetailPane — notes editor", () => {
  it("Edit → change → blur commits the content patch and switches back on Preview", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail({ content: "old", hasContent: true })}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    // Default mode when content is present is "view"; toggle to Edit.
    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));
    const textarea = screen.getByLabelText("Todo notes") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "brand new notes" } });
    fireEvent.blur(textarea);
    expect(onUpdate).toHaveBeenCalledWith(1, { content: "brand new notes" });
  });

  it("Blurring an empty textarea commits content: null so the row goes back to no-notes", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <TodoDetailPane
        detail={makeDetail({ content: "old", hasContent: true })}
        detailLoading={false}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));
    const textarea = screen.getByLabelText("Todo notes") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.blur(textarea);
    expect(onUpdate).toHaveBeenCalledWith(1, { content: null });
  });
});
