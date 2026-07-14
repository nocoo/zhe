"use server";

/**
 * Server actions for todos. Mirrors `actions/ideas.ts`:
 *   - `getAuthContext()` gate returning `{ success: false, error: 'Unauthorized' }`
 *     when the caller is not signed in
 *   - `ActionResult<T>` envelope so React Server Component consumers can
 *     branch on `success` without try/catch
 *   - hand-written validation (no Zod, per docs/21-todos-feature.md §Server
 *     Actions)
 *   - typed ScopedDB errors (`TodoNotFoundError`, `TodoDepthExceededError`,
 *     `TodoMoveConflictError`) are mapped to stable `error` strings so the
 *     UI can key on message text without needing to import the classes.
 */

import { getAuthContext } from "@/lib/auth-context";
import {
  type CreateTodoInput,
  type MoveTodoResult,
  TodoDepthExceededError,
  type TodoDetail,
  TodoMoveConflictError,
  TodoNotFoundError,
  type TodoTreeNode,
  type UpdateTodoPatch,
} from "@/lib/db/scoped";

export interface ActionResult<T = void> {
  success: boolean;
  data?: T | undefined;
  error?: string | undefined;
}

/**
 * Input shape for `createTodo`. Deliberately mirrors `CreateTodoInput` from
 * the ScopedDB layer minus the `Date` type — the client sends `dueAt` as an
 * epoch millisecond number so the value survives JSON serialisation over the
 * server-action wire (`Date` gets stringified and the wrapper wouldn't
 * survive round-tripping in some Next.js runtimes).
 */
export interface CreateTodoActionInput {
  title: string;
  parentId?: number | null | undefined;
  content?: string | null | undefined;
  dueAtMs?: number | null | undefined;
  tagNames?: string[] | undefined;
  emoji?: string | null | undefined;
}

export interface UpdateTodoActionInput {
  title?: string | undefined;
  content?: string | null | undefined;
  done?: boolean | undefined;
  dueAtMs?: number | null | undefined;
  tagNames?: string[] | undefined;
  emoji?: string | null | undefined;
}

export interface MoveTodoActionInput {
  parentId: number | null;
  position: number;
}

/**
 * Resolve a `dueAtMs` wire value into what ScopedDB expects:
 *   - `undefined` → not present in the patch (caller unchanged)
 *   - `null`      → clear the column
 *   - finite ms   → `new Date(ms)`
 *   - anything else (NaN, Infinity, non-number that slipped past TS at the
 *     server-action boundary) → typed error the caller maps to
 *     `ActionResult.error`.
 *
 * TS types are advisory across the server-action wire; a stray `NaN` would
 * otherwise pass through to a `new Date(NaN)` and eventually get JSON-ified
 * to `null` in the D1 proxy request — silently clearing the due date. This
 * helper turns that into an explicit rejection.
 */
class InvalidDueAtError extends Error {
  constructor() {
    super("Due date must be a finite timestamp");
    this.name = "InvalidDueAtError";
  }
}

function resolveDueAt(
  raw: number | null | undefined,
): { present: false } | { present: true; value: Date | null } {
  if (raw === undefined) return { present: false };
  if (raw === null) return { present: true, value: null };
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new InvalidDueAtError();
  }
  return { present: true, value: new Date(raw) };
}

/**
 * Validate a wire `emoji` value.
 *
 *   - `undefined` → not present in the patch (caller unchanged)
 *   - `null`      → clear the column
 *   - string of ≤ 8 UTF-16 units (≈ 1–4 emoji codepoints, covering ZWJ
 *     sequences like family emoji) → passed through
 *   - anything else → typed error the caller maps to `ActionResult.error`
 *
 * The cap is a defensive check: the picker limits to a single glyph on
 * the client, but the action boundary is where advisory TS types stop
 * being enforced.
 */
class InvalidEmojiError extends Error {
  constructor() {
    super("Emoji must be a short string or null");
    this.name = "InvalidEmojiError";
  }
}

function resolveEmoji(
  raw: string | null | undefined,
): { present: false } | { present: true; value: string | null } {
  if (raw === undefined) return { present: false };
  if (raw === null) return { present: true, value: null };
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 8) {
    throw new InvalidEmojiError();
  }
  return { present: true, value: raw };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Fetch every todo the user owns, flat and sorted (parentId, position).
 * The client rebuilds the forest.
 */
export async function getTodos(): Promise<ActionResult<TodoTreeNode[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };
    return { success: true, data: await ctx.db.getTodos() };
  } catch (error) {
    console.error("Failed to get todos:", error);
    return { success: false, error: "Failed to get todos" };
  }
}

/** Fetch a single todo detail (with content + tags) by id. */
export async function getTodo(id: number): Promise<ActionResult<TodoDetail>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };
    const todo = await ctx.db.getTodoById(id);
    if (!todo) return { success: false, error: "Todo not found" };
    return { success: true, data: todo };
  } catch (error) {
    console.error("Failed to get todo:", error);
    return { success: false, error: "Failed to get todo" };
  }
}

/** Distinct free-form tag names used across the user's todos. */
export async function getTodoTags(): Promise<ActionResult<string[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };
    return { success: true, data: await ctx.db.getTodoTags() };
  } catch (error) {
    console.error("Failed to get todo tags:", error);
    return { success: false, error: "Failed to get todo tags" };
  }
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

export async function createTodo(input: CreateTodoActionInput): Promise<ActionResult<TodoDetail>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };

    const title = input.title.trim();
    if (title.length === 0) {
      return { success: false, error: "Title cannot be empty" };
    }
    if (
      input.parentId !== undefined &&
      input.parentId !== null &&
      !Number.isInteger(input.parentId)
    ) {
      return { success: false, error: "Parent id must be an integer or null" };
    }

    const scopedInput: CreateTodoInput = { title };
    if (input.parentId !== undefined) scopedInput.parentId = input.parentId;
    if (input.content !== undefined) scopedInput.content = input.content;
    const dueAt = resolveDueAt(input.dueAtMs);
    if (dueAt.present) scopedInput.dueAt = dueAt.value;
    const emoji = resolveEmoji(input.emoji);
    if (emoji.present) scopedInput.emoji = emoji.value;
    if (input.tagNames !== undefined) scopedInput.tagNames = input.tagNames;

    const todo = await ctx.db.createTodo(scopedInput);
    return { success: true, data: todo };
  } catch (error) {
    if (error instanceof InvalidDueAtError) {
      return { success: false, error: error.message };
    }
    if (error instanceof InvalidEmojiError) {
      return { success: false, error: error.message };
    }
    if (error instanceof TodoNotFoundError) {
      return { success: false, error: "Parent todo not found" };
    }
    if (error instanceof TodoDepthExceededError) {
      return { success: false, error: "Todo depth would exceed the maximum" };
    }
    console.error("Failed to create todo:", error);
    return { success: false, error: "Failed to create todo" };
  }
}

export async function updateTodo(
  id: number,
  input: UpdateTodoActionInput,
): Promise<ActionResult<TodoDetail>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };

    // Only validate title when the caller sends one; a caller that leaves
    // it off is intentionally patching other fields.
    if (input.title !== undefined && input.title.trim().length === 0) {
      return { success: false, error: "Title cannot be empty" };
    }

    const patch: UpdateTodoPatch = {};
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.content !== undefined) patch.content = input.content;
    if (input.done !== undefined) patch.done = input.done;
    const dueAt = resolveDueAt(input.dueAtMs);
    if (dueAt.present) patch.dueAt = dueAt.value;
    const emoji = resolveEmoji(input.emoji);
    if (emoji.present) patch.emoji = emoji.value;
    if (input.tagNames !== undefined) patch.tagNames = input.tagNames;

    const todo = await ctx.db.updateTodo(id, patch);
    if (!todo) return { success: false, error: "Todo not found" };
    return { success: true, data: todo };
  } catch (error) {
    if (error instanceof InvalidDueAtError) {
      return { success: false, error: error.message };
    }
    if (error instanceof InvalidEmojiError) {
      return { success: false, error: error.message };
    }
    console.error("Failed to update todo:", error);
    return { success: false, error: "Failed to update todo" };
  }
}

export async function moveTodo(
  id: number,
  input: MoveTodoActionInput,
): Promise<ActionResult<MoveTodoResult>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };

    if (!Number.isInteger(input.position) || input.position < 0) {
      return { success: false, error: "Position must be a non-negative integer" };
    }
    if (input.parentId !== null && !Number.isInteger(input.parentId)) {
      return { success: false, error: "Parent id must be an integer or null" };
    }

    const result = await ctx.db.moveTodo(id, {
      parentId: input.parentId,
      position: input.position,
    });
    return { success: true, data: result };
  } catch (error) {
    // The ScopedDB layer surfaces four typed errors for the move contract;
    // map each to a stable ActionResult.error string so the UI can key on
    // message text without importing the classes across the RSC boundary.
    if (error instanceof TodoMoveConflictError) {
      return { success: false, error: "Move conflicted or invalid" };
    }
    if (error instanceof TodoNotFoundError) {
      return { success: false, error: "Todo not found" };
    }
    if (error instanceof TodoDepthExceededError) {
      return { success: false, error: "Todo depth would exceed the maximum" };
    }
    console.error("Failed to move todo:", error);
    return { success: false, error: "Failed to move todo" };
  }
}

export async function reorderTodoSiblings(
  parentId: number | null,
  orderedIds: readonly number[],
): Promise<ActionResult<number[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };

    if (parentId !== null && !Number.isInteger(parentId)) {
      return { success: false, error: "Parent id must be an integer or null" };
    }
    for (const cid of orderedIds) {
      if (!Number.isInteger(cid)) {
        return { success: false, error: "orderedIds must be integers" };
      }
    }

    const result = await ctx.db.reorderSiblings(parentId, orderedIds);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof TodoMoveConflictError) {
      return { success: false, error: "Reorder conflicted or invalid" };
    }
    console.error("Failed to reorder siblings:", error);
    return { success: false, error: "Failed to reorder siblings" };
  }
}

export async function deleteTodo(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };
    const removed = await ctx.db.deleteTodo(id);
    if (!removed) return { success: false, error: "Todo not found" };
    return { success: true };
  } catch (error) {
    console.error("Failed to delete todo:", error);
    return { success: false, error: "Failed to delete todo" };
  }
}
