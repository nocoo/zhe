// @vitest-environment node

import { describe, expect, it } from "vitest";
import { TodoDepthExceededError, TodoMoveConflictError, TodoNotFoundError } from "@/lib/db/scoped";
import {
  buildCreateTodoInput,
  buildMoveTodoInput,
  buildReorderPayload,
  buildUpdateTodoPatch,
  InvalidDueAtError,
  InvalidEmojiError,
  mapCreateTodoError,
  mapMoveTodoError,
  mapReorderTodoError,
  mapUpdateTodoError,
} from "@/models/todo-wire";

describe("todo-wire action/API error contract", () => {
  it("preserves stable validation messages for server actions", () => {
    expect(buildCreateTodoInput({ title: "  " })).toEqual({ error: "Title cannot be empty" });
    expect(buildCreateTodoInput({ title: "x", parentId: 1.5 })).toEqual({
      error: "Parent id must be an integer or null",
    });
    expect(buildUpdateTodoPatch({ title: "  " })).toEqual({ error: "Title cannot be empty" });
    expect(buildMoveTodoInput({ parentId: null })).toEqual({ error: "Missing 'position' field" });
    expect(buildMoveTodoInput({ parentId: null, position: -1 })).toEqual({
      error: "Position must be a non-negative integer",
    });
    expect(buildMoveTodoInput({ position: 0 })).toEqual({ error: "Missing 'parentId' field" });
    expect(buildReorderPayload("x", [])).toEqual({ error: "Parent id must be an integer or null" });
    expect(buildReorderPayload(null, ["x"])).toEqual({ error: "orderedIds must be integers" });
  });

  it("maps scoped errors to stable ActionResult strings", () => {
    expect(mapCreateTodoError(new InvalidDueAtError())).toBe("Due date must be a finite timestamp");
    expect(mapCreateTodoError(new TodoNotFoundError())).toBe("Parent todo not found");
    expect(mapCreateTodoError(new TodoDepthExceededError())).toBe(
      "Todo depth would exceed the maximum",
    );
    expect(mapCreateTodoError(new Error("db"))).toBe("Failed to create todo");

    expect(mapUpdateTodoError(new InvalidEmojiError())).toBe(
      "Emoji must be a short string or null",
    );
    expect(mapMoveTodoError(new TodoMoveConflictError())).toBe("Move conflicted or invalid");
    expect(mapMoveTodoError(new TodoNotFoundError())).toBe("Todo not found");
    expect(mapReorderTodoError(new TodoMoveConflictError())).toBe("Reorder conflicted or invalid");
  });
});
