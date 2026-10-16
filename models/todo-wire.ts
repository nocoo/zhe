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
import { isValidDueAtMs } from "@/lib/todo-due-ms";

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
  if (!isValidDueAtMs(raw)) {
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

/** Decimal digits only, no leading zero — matches path params and CLI `parsePositiveInt`. */
export const STRICT_POSITIVE_INT_PATTERN = /^[1-9]\d*$/;

/**
 * Parse a URL path segment as a todo id. Rejects partial parses (`1.5`, `1foreign`, `1e3`).
 */
export function parseTodoIdParam(id: string): number | null {
  if (!STRICT_POSITIVE_INT_PATTERN.test(id)) return null;
  const parsed = Number(id);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/** Wire JSON number: positive safe integer, or null when explicitly null. */
export function parseWireTodoId(raw: unknown): number | null | "invalid" {
  if (raw === null) return null;
  if (typeof raw !== "number") return "invalid";
  if (!Number.isSafeInteger(raw) || raw <= 0) return "invalid";
  return raw;
}

function validateParentId(raw: unknown): string | null {
  if (raw === undefined) return null;
  const parsed = parseWireTodoId(raw);
  if (parsed === "invalid") return "Parent id must be an integer or null";
  return null;
}

function validateOrderedTodoIds(raw: unknown): string | null {
  if (!Array.isArray(raw)) return "orderedIds must be an array";
  for (const cid of raw) {
    if (parseWireTodoId(cid) === "invalid") {
      return "orderedIds must be integers";
    }
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
    if (input.parentId !== undefined) {
      scopedInput.parentId = input.parentId === null ? null : (input.parentId as number);
    }
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
  const parentId = parseWireTodoId(input.parentId);
  if (parentId === "invalid") return { error: "Parent id must be an integer or null" };
  return {
    input: {
      parentId,
      position: input.position as number,
    },
  };
}

/** Validate reorder-siblings payload. */
export function buildReorderPayload(
  parentId: unknown,
  orderedIds: unknown,
): { error: string } | { parentId: number | null; orderedIds: number[] } {
  if (parentId === undefined) return { error: "Missing 'parentId' field" };
  const parsedParent = parseWireTodoId(parentId);
  if (parsedParent === "invalid") return { error: "Parent id must be an integer or null" };
  const idsErr = validateOrderedTodoIds(orderedIds);
  if (idsErr) return { error: idsErr };
  return { parentId: parsedParent, orderedIds: orderedIds as number[] };
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
