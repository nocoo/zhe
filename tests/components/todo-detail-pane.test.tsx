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
    tagNames: [],
    dueAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    content: null,
    excerpt: null,
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
