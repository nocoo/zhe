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
import type { MoveTodoResult, TodoDetail, TodoTreeNode } from "@/lib/db/scoped";
import {
  buildCreateTodoInput,
  buildMoveTodoInput,
  buildReorderPayload,
  buildUpdateTodoPatch,
  mapCreateTodoError,
  mapMoveTodoError,
  mapReorderTodoError,
  mapUpdateTodoError,
} from "@/models/todo-wire";

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

    const built = buildCreateTodoInput(input);
    if ("error" in built) return { success: false, error: built.error };

    const todo = await ctx.db.createTodo(built.input);
    return { success: true, data: todo };
  } catch (error) {
    console.error("Failed to create todo:", error);
    return { success: false, error: mapCreateTodoError(error) };
  }
}

export async function updateTodo(
  id: number,
  input: UpdateTodoActionInput,
): Promise<ActionResult<TodoDetail>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };

    const built = buildUpdateTodoPatch(input);
    if ("error" in built) return { success: false, error: built.error };

    const todo = await ctx.db.updateTodo(id, built.patch);
    if (!todo) return { success: false, error: "Todo not found" };
    return { success: true, data: todo };
  } catch (error) {
    console.error("Failed to update todo:", error);
    return { success: false, error: mapUpdateTodoError(error) };
  }
}

export async function moveTodo(
  id: number,
  input: MoveTodoActionInput,
): Promise<ActionResult<MoveTodoResult>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };

    const built = buildMoveTodoInput(input);
    if ("error" in built) return { success: false, error: built.error };

    const result = await ctx.db.moveTodo(id, built.input);
    return { success: true, data: result };
  } catch (error) {
    console.error("Failed to move todo:", error);
    return { success: false, error: mapMoveTodoError(error) };
  }
}

export async function reorderTodoSiblings(
  parentId: number | null,
  orderedIds: readonly number[],
): Promise<ActionResult<number[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Unauthorized" };

    const built = buildReorderPayload(parentId, orderedIds);
    if ("error" in built) return { success: false, error: built.error };

    const result = await ctx.db.reorderSiblings(built.parentId, built.orderedIds);
    return { success: true, data: result };
  } catch (error) {
    console.error("Failed to reorder siblings:", error);
    return { success: false, error: mapReorderTodoError(error) };
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
