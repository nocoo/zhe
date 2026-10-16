/**
 * Shared todo wire validation for server actions and REST API.
 * Keeps dueAtMs / emoji handling and stable error strings in one place.
 */

import {
  type CreateTodoInput,
  type MoveTodoInput,
  TodoDepthExceededError,
  TodoMoveConflictError,
  TodoNotFoundError,
  type UpdateTodoPatch,
} from "@/lib/db/scoped";

export class InvalidDueAtError extends Error {
  constructor() {
    super("Due date must be a finite timestamp");
    this.name = "InvalidDueAtError";
  }
}

export class InvalidEmojiError extends Error {
  constructor() {
    super("Emoji must be a short string or null");
    this.name = "InvalidEmojiError";
  }
}

export type DueAtResolution = { present: false } | { present: true; value: Date | null };

/** Resolve a `dueAtMs` wire value into what ScopedDB expects. */
export function resolveDueAt(raw: number | null | undefined): DueAtResolution {
  if (raw === undefined) return { present: false };
  if (raw === null) return { present: true, value: null };
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new InvalidDueAtError();
  }
  return { present: true, value: new Date(raw) };
}

export type EmojiResolution = { present: false } | { present: true; value: string | null };

/** Validate a wire `emoji` value. */
export function resolveEmoji(raw: string | null | undefined): EmojiResolution {
  if (raw === undefined) return { present: false };
  if (raw === null) return { present: true, value: null };
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 8) {
    throw new InvalidEmojiError();
  }
  return { present: true, value: raw };
}

export interface CreateTodoWireInput {
  title?: unknown;
  parentId?: unknown;
  content?: unknown;
  dueAtMs?: unknown;
  tagNames?: unknown;
  emoji?: unknown;
}

export interface UpdateTodoWireInput {
  title?: unknown;
  content?: unknown;
  done?: unknown;
  dueAtMs?: unknown;
  tagNames?: unknown;
  emoji?: unknown;
}

export interface MoveTodoWireInput {
  parentId?: unknown;
  position?: unknown;
}

function validateParentId(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return "Parent id must be an integer or null";
  }
  return null;
}

function validateTagNames(raw: unknown): string | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return "tagNames must be an array";
  if (!raw.every((t) => typeof t === "string")) return "All tag names must be strings";
  return null;
}

/** Build ScopedDB create input from JSON / server-action wire. */
export function buildCreateTodoInput(
  input: CreateTodoWireInput,
): { error: string } | { input: CreateTodoInput } {
  if (typeof input.title !== "string") {
    return { error: "Missing or invalid 'title' field" };
  }
  const title = input.title.trim();
  if (title.length === 0) return { error: "Title cannot be empty" };

  const parentErr = validateParentId(input.parentId);
  if (parentErr) return { error: parentErr };

  if (input.content !== undefined && input.content !== null && typeof input.content !== "string") {
    return { error: "'content' must be a string or null" };
  }

  const tagErr = validateTagNames(input.tagNames);
  if (tagErr) return { error: tagErr };

  try {
    const scopedInput: CreateTodoInput = { title };
    if (input.parentId !== undefined) scopedInput.parentId = input.parentId as number | null;
    if (input.content !== undefined) scopedInput.content = input.content as string | null;
    const dueAt = resolveDueAt(input.dueAtMs as number | null | undefined);
    if (dueAt.present) scopedInput.dueAt = dueAt.value;
    const emoji = resolveEmoji(input.emoji as string | null | undefined);
    if (emoji.present) scopedInput.emoji = emoji.value;
    if (input.tagNames !== undefined) scopedInput.tagNames = input.tagNames as string[];
    return { input: scopedInput };
  } catch (error) {
    if (error instanceof InvalidDueAtError || error instanceof InvalidEmojiError) {
      return { error: error.message };
    }
    throw error;
  }
}

/** Build ScopedDB update patch from JSON / server-action wire. */
export function buildUpdateTodoPatch(
  input: UpdateTodoWireInput,
): { error: string } | { patch: UpdateTodoPatch } {
  if (input.title !== undefined) {
    if (typeof input.title !== "string") return { error: "'title' must be a string" };
    if (input.title.trim().length === 0) return { error: "Title cannot be empty" };
  }
  if (input.content !== undefined && input.content !== null && typeof input.content !== "string") {
    return { error: "'content' must be a string or null" };
  }
  if (input.done !== undefined && typeof input.done !== "boolean") {
    return { error: "'done' must be a boolean" };
  }
  const tagErr = validateTagNames(input.tagNames);
  if (tagErr) return { error: tagErr };

  try {
    const patch: UpdateTodoPatch = {};
    if (input.title !== undefined) patch.title = (input.title as string).trim();
    if (input.content !== undefined) patch.content = input.content as string | null;
    if (input.done !== undefined) patch.done = input.done as boolean;
    const dueAt = resolveDueAt(input.dueAtMs as number | null | undefined);
    if (dueAt.present) patch.dueAt = dueAt.value;
    const emoji = resolveEmoji(input.emoji as string | null | undefined);
    if (emoji.present) patch.emoji = emoji.value;
    if (input.tagNames !== undefined) patch.tagNames = input.tagNames as string[];
    return { patch };
  } catch (error) {
    if (error instanceof InvalidDueAtError || error instanceof InvalidEmojiError) {
      return { error: error.message };
    }
    throw error;
  }
}

/** Validate move payload. */
export function buildMoveTodoInput(
  input: MoveTodoWireInput,
): { error: string } | { input: MoveTodoInput } {
  if (input.position === undefined) return { error: "Missing 'position' field" };
  if (
    typeof input.position !== "number" ||
    !Number.isInteger(input.position) ||
    input.position < 0
  ) {
    return { error: "Position must be a non-negative integer" };
  }
  if (input.parentId === undefined) return { error: "Missing 'parentId' field" };
  if (
    input.parentId !== null &&
    (typeof input.parentId !== "number" || !Number.isInteger(input.parentId))
  ) {
    return { error: "Parent id must be an integer or null" };
  }
  return {
    input: {
      parentId: input.parentId as number | null,
      position: input.position,
    },
  };
}

/** Validate reorder-siblings payload. */
export function buildReorderPayload(
  parentId: unknown,
  orderedIds: unknown,
): { error: string } | { parentId: number | null; orderedIds: number[] } {
  if (parentId === undefined) return { error: "Missing 'parentId' field" };
  if (parentId !== null && (typeof parentId !== "number" || !Number.isInteger(parentId))) {
    return { error: "Parent id must be an integer or null" };
  }
  if (!Array.isArray(orderedIds)) return { error: "orderedIds must be an array" };
  for (const cid of orderedIds) {
    if (typeof cid !== "number" || !Number.isInteger(cid)) {
      return { error: "orderedIds must be integers" };
    }
  }
  return { parentId: parentId as number | null, orderedIds };
}

export function parseTodoIdParam(id: string): number | null {
  const parsed = Number.parseInt(id, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function mapCreateTodoError(error: unknown): string {
  if (error instanceof InvalidDueAtError || error instanceof InvalidEmojiError) {
    return error.message;
  }
  if (error instanceof TodoNotFoundError) return "Parent todo not found";
  if (error instanceof TodoDepthExceededError) return "Todo depth would exceed the maximum";
  return "Failed to create todo";
}

export function mapUpdateTodoError(error: unknown): string {
  if (error instanceof InvalidDueAtError || error instanceof InvalidEmojiError) {
    return error.message;
  }
  return "Failed to update todo";
}

export function mapMoveTodoError(error: unknown): string {
  if (error instanceof TodoMoveConflictError) return "Move conflicted or invalid";
  if (error instanceof TodoNotFoundError) return "Todo not found";
  if (error instanceof TodoDepthExceededError) return "Todo depth would exceed the maximum";
  return "Failed to move todo";
}

export function mapReorderTodoError(error: unknown): string {
  if (error instanceof TodoMoveConflictError) return "Reorder conflicted or invalid";
  return "Failed to reorder siblings";
}
