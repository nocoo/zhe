/**
 * Todo operations for ScopedDB. Free functions that take userId; the
 * ScopedDB class methods in ../scoped.ts are thin delegators.
 *
 * The tree lives in an adjacency-list `todos` table (self-ref `parent_id`,
 * dense integer `position` within `(user_id, parent_id)`). Colour and depth
 * checks stay in the application layer; ownership and cycle safety are
 * enforced by write-time SQL guards.
 *
 * See docs/21-todos-feature.md for the full contract, especially "Move
 * (contract)" — reparenting is a two-phase safe-tail write; same-parent
 * reorder is a distinct path that never runs the cycle/depth SQL because
 * neither is reachable when the parent does not change.
 */

import { executeD1Query, executeD1Batch, type D1Statement } from '../d1-client';
import { generateExcerpt } from '../../markdown';
import {
  MAX_TODO_DEPTH,
  TodoDepthExceededError,
  TodoMoveConflictError,
  TodoNotFoundError,
  type CreateTodoInput,
  type MoveTodoInput,
  type MoveTodoResult,
  type TodoDetail,
  type TodoTreeNode,
  type UpdateTodoPatch,
} from './types';

/* -------------------------------------------------------------------------- */
/* Row mappers                                                                */
/* -------------------------------------------------------------------------- */

function rowToTreeNode(
  row: Record<string, unknown>,
  tagNames: string[],
): TodoTreeNode {
  return {
    id: row.id as number,
    parentId: (row.parent_id as number | null) ?? null,
    position: row.position as number,
    title: row.title as string,
    done: Boolean(row.done),
    hasContent: row.content !== null && row.content !== undefined,
    excerpt: (row.excerpt as string | null) ?? null,
    tagNames,
    dueAt: row.due_at != null ? new Date(row.due_at as number) : null,
    emoji: (row.emoji as string | null) ?? null,
    createdAt: new Date(row.created_at as number),
    updatedAt: new Date(row.updated_at as number),
  };
}

function rowToDetail(
  row: Record<string, unknown>,
  tagNames: string[],
): TodoDetail {
  const base = rowToTreeNode(row, tagNames);
  return {
    ...base,
    content: (row.content as string | null) ?? null,
    doneAt: row.done_at != null ? new Date(row.done_at as number) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Tag helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Canonicalise a free-form tag name: trim + lower-case. Matches the
 * `todo_tags.name` PK invariant so `"Urgent"` and `"urgent"` collide.
 * Names that collapse to empty strings after trimming are dropped.
 */
function canonicaliseTagNames(input: readonly string[] | undefined): string[] {
  if (!input || input.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const canonical = raw.trim().toLowerCase();
    if (canonical.length === 0 || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

async function getTagNamesForTodos(
  todoIds: number[],
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (todoIds.length === 0) return map;
  const placeholders = todoIds.map(() => '?').join(', ');
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT todo_id, name FROM todo_tags WHERE todo_id IN (${placeholders}) ORDER BY name`,
    todoIds,
  );
  for (const row of rows) {
    const todoId = row.todo_id as number;
    const name = row.name as string;
    const existing = map.get(todoId);
    if (existing) existing.push(name);
    else map.set(todoId, [name]);
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Fetch every todo the user owns, sorted `(parent_id, position)` so the
 * client can assemble the forest in one pass. Full markdown content is
 * intentionally not selected — the tree row does not render it and the
 * payload can grow large. The short `excerpt` column IS selected so
 * global search can substring-match against notes without a second
 * round-trip; excerpt is capped at 200 chars at write time (see
 * `createTodo` / `updateTodo`).
 */
export async function getTodos(userId: string): Promise<TodoTreeNode[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT id, parent_id, position, title, done, due_at, excerpt, emoji,
            content IS NOT NULL AS content_present,
            created_at, updated_at
       FROM todos
      WHERE user_id = ?
      ORDER BY parent_id NULLS FIRST, position, id`,
    [userId],
  );
  const todoIds = rows.map((r) => r.id as number);
  const tagMap = await getTagNamesForTodos(todoIds);
  return rows.map((row) => {
    // `hasContent` derives from the projected boolean column so we never
    // shuttle the full markdown into the list payload; excerpt is short
    // enough to keep on the wire.
    const projected: Record<string, unknown> = {
      ...row,
      content: row.content_present ? 'x' : null,
    };
    return rowToTreeNode(projected, tagMap.get(row.id as number) ?? []);
  });
}

export async function getTodoById(
  userId: string,
  id: number,
): Promise<TodoDetail | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT * FROM todos WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const tagMap = await getTagNamesForTodos([id]);
  return rowToDetail(row, tagMap.get(id) ?? []);
}

/**
 * Distinct tag names in use across the user's todos. Sorted alphabetically
 * so the tag autocompleter has a stable order.
 */
export async function getTodoTags(userId: string): Promise<string[]> {
  const rows = await executeD1Query<{ name: string }>(
    `SELECT DISTINCT tt.name
       FROM todo_tags tt
       JOIN todos t ON t.id = tt.todo_id
      WHERE t.user_id = ?
      ORDER BY tt.name`,
    [userId],
  );
  return rows.map((r) => r.name);
}

/* -------------------------------------------------------------------------- */
/* Depth helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Depth of a node from root, counting the node itself. Root nodes have depth 1
 * so `depth + subtreeHeight` stays comparable to `MAX_TODO_DEPTH`.
 * Returns 0 iff the node does not exist (or belongs to a different user).
 */
async function computeDepth(userId: string, nodeId: number): Promise<number> {
  const rows = await executeD1Query<{ depth: number }>(
    `WITH RECURSIVE anc(id, parent_id, depth) AS (
       SELECT id, parent_id, 1 FROM todos WHERE id = ? AND user_id = ?
       UNION ALL
       SELECT t.id, t.parent_id, a.depth + 1
         FROM todos t JOIN anc a ON t.id = a.parent_id
        WHERE t.user_id = ? AND a.depth < ?
     )
     SELECT MAX(depth) AS depth FROM anc`,
    [nodeId, userId, userId, MAX_TODO_DEPTH + 1],
  );
  return (rows[0]?.depth as number | null) ?? 0;
}

/**
 * Height of the subtree rooted at `nodeId`, measured as the maximum number
 * of edges from `nodeId` down to any descendant (leaves → 0).
 */
async function computeSubtreeHeight(
  userId: string,
  nodeId: number,
): Promise<number> {
  const rows = await executeD1Query<{ h: number | null }>(
    `WITH RECURSIVE d(id, depth_below) AS (
       SELECT id, 0 FROM todos WHERE id = ? AND user_id = ?
       UNION ALL
       SELECT t.id, d.depth_below + 1
         FROM todos t JOIN d ON t.parent_id = d.id
        WHERE t.user_id = ? AND d.depth_below < ?
     )
     SELECT MAX(depth_below) AS h FROM d`,
    [nodeId, userId, userId, MAX_TODO_DEPTH],
  );
  return (rows[0]?.h as number | null) ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Insert a new todo at the tail of the target parent's sibling list. Cycle
 * cannot arise (new id has no descendants) so we only guard depth and
 * parent ownership. Tags are inserted in a follow-up batch after the todo
 * row lands (D1 has no cross-statement variable-binding, so the tag
 * bindings cannot share the same batch that assigns the new todo id); on
 * tag-batch failure we compensate by deleting the freshly-inserted todo.
 */
export async function createTodo(
  userId: string,
  input: CreateTodoInput,
): Promise<TodoDetail> {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new Error('Todo title cannot be empty');
  }

  const parentId = input.parentId ?? null;
  if (parentId !== null) {
    const parentDepth = await computeDepth(userId, parentId);
    if (parentDepth === 0) {
      throw new TodoNotFoundError('Parent todo not found');
    }
    if (parentDepth + 1 > MAX_TODO_DEPTH) {
      throw new TodoDepthExceededError();
    }
  }

  const now = Date.now();
  const content = input.content ?? null;
  const excerpt = content !== null ? generateExcerpt(content, 200) : null;
  const dueAt = input.dueAt ? input.dueAt.getTime() : null;
  const emoji = input.emoji ?? null;
  const tagNames = canonicaliseTagNames(input.tagNames);

  // Position = MAX(position) + 1 for the target parent; computed inline so
  // two concurrent creates against the same parent cannot pick the same
  // slot. `IS` handles the NULL parent-id case (SQLite `= NULL` never
  // matches).
  const [inserted] = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO todos (
        user_id, parent_id, position, title, content, excerpt,
        done, done_at, due_at, emoji, created_at, updated_at
     ) VALUES (
        ?, ?,
        COALESCE(
          (SELECT MAX(position) + 1 FROM todos
            WHERE user_id = ? AND parent_id IS ?),
          0
        ),
        ?, ?, ?, 0, NULL, ?, ?, ?, ?
     )
     RETURNING *`,
    [
      userId,
      parentId,
      userId,
      parentId,
      title,
      content,
      excerpt,
      dueAt,
      emoji,
      now,
      now,
    ],
  );
  if (!inserted) {
    throw new Error('Failed to create todo');
  }
  const todoId = inserted.id as number;

  if (tagNames.length > 0) {
    try {
      const statements: D1Statement[] = tagNames.map((name) => ({
        sql: `INSERT INTO todo_tags (todo_id, name, created_at) VALUES (?, ?, ?)`,
        params: [todoId, name, now],
      }));
      await executeD1Batch(statements);
    } catch (err) {
      console.error('createTodo: tag insert failed, rolling back todo', err);
      await executeD1Query('DELETE FROM todos WHERE id = ? AND user_id = ?', [
        todoId,
        userId,
      ]);
      throw err;
    }
  }

  return rowToDetail(inserted, tagNames);
}

/* -------------------------------------------------------------------------- */
/* Update                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Patch an existing todo. All fields optional; tag names replace-all when
 * provided (delete then re-insert in one batch). `done` toggling flips
 * `done_at` in the same batch.
 */
export async function updateTodo(
  userId: string,
  id: number,
  patch: UpdateTodoPatch,
): Promise<TodoDetail | null> {
  const existing = await getTodoById(userId, id);
  if (!existing) return null;

  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const setParams: unknown[] = [now];

  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (trimmed.length === 0) {
      throw new Error('Todo title cannot be empty');
    }
    setClauses.push('title = ?');
    setParams.push(trimmed);
  }
  if (patch.content !== undefined) {
    const content = patch.content;
    setClauses.push('content = ?');
    setParams.push(content);
    setClauses.push('excerpt = ?');
    setParams.push(content !== null ? generateExcerpt(content, 200) : null);
  }
  if (patch.done !== undefined) {
    setClauses.push('done = ?');
    setParams.push(patch.done ? 1 : 0);
    // done_at flips in lockstep so historical queries stay consistent.
    // Only overwrite the timestamp when the flag actually changes, so a
    // no-op "done -> done" patch does not shift the completion time.
    if (patch.done !== existing.done) {
      setClauses.push('done_at = ?');
      setParams.push(patch.done ? now : null);
    }
  }
  if (patch.dueAt !== undefined) {
    setClauses.push('due_at = ?');
    setParams.push(patch.dueAt ? patch.dueAt.getTime() : null);
  }
  if (patch.emoji !== undefined) {
    // `null` clears; short strings are stored as-is. Length validation
    // happens in the action layer before we get here.
    setClauses.push('emoji = ?');
    setParams.push(patch.emoji);
  }

  const statements: D1Statement[] = [
    {
      sql: `UPDATE todos SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
      params: [...setParams, id, userId],
    },
  ];

  if (patch.tagNames !== undefined) {
    const canonical = canonicaliseTagNames(patch.tagNames);
    statements.push({
      sql: `DELETE FROM todo_tags WHERE todo_id = ?`,
      params: [id],
    });
    for (const name of canonical) {
      statements.push({
        sql: `INSERT INTO todo_tags (todo_id, name, created_at) VALUES (?, ?, ?)`,
        params: [id, name, now],
      });
    }
  }

  const results = await executeD1Batch<Record<string, unknown>>(statements);
  const row = results[0]?.[0];
  if (!row) return null;

  const finalTags =
    patch.tagNames !== undefined
      ? canonicaliseTagNames(patch.tagNames)
      : existing.tagNames;
  return rowToDetail(row, finalTags);
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Delete a todo. FK `ON DELETE CASCADE` on both `parent_id` and
 * `todo_tags.todo_id` removes the whole subtree and its tag bindings in a
 * single statement.
 *
 * Sibling `position` values are left with a gap where the deleted row used
 * to sit; `ORDER BY position` renders correctly and the next move on the
 * parent will re-compact. Same trade-off as documented in the Move (contract).
 */
export async function deleteTodo(userId: string, id: number): Promise<boolean> {
  const rows = await executeD1Query<{ id: number }>(
    `DELETE FROM todos WHERE id = ? AND user_id = ? RETURNING id`,
    [id, userId],
  );
  return rows.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Move (reparent) — two-phase safe-tail                                      */
/* -------------------------------------------------------------------------- */

/**
 * Snapshot returned by the Phase-1 preflight SELECT. `movingSubtreeHeight`
 * is measured in edges from the moving row down to its deepest descendant
 * (leaf → 0); it feeds the write-time depth guard so a tall subtree cannot
 * push descendants past MAX_TODO_DEPTH when moved under a moderately-deep
 * parent.
 */
interface MovePreflight {
  movingRow: { id: number; parentId: number | null; position: number };
  movingSubtreeHeight: number;
  oldParentId: number | null;
  oldPosition: number;
}

async function movePreflight(
  userId: string,
  movingId: number,
): Promise<MovePreflight | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT id, parent_id, position FROM todos WHERE id = ? AND user_id = ? LIMIT 1`,
    [movingId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const height = await computeSubtreeHeight(userId, movingId);
  return {
    movingRow: {
      id: row.id as number,
      parentId: (row.parent_id as number | null) ?? null,
      position: row.position as number,
    },
    movingSubtreeHeight: height,
    oldParentId: (row.parent_id as number | null) ?? null,
    oldPosition: row.position as number,
  };
}

/**
 * Reorder a todo among its current siblings (no reparent). Split out from
 * `moveTodo` because same-parent moves are structurally incapable of
 * creating a cycle or altering depth, so running the cycle/depth SQL guard
 * would be wasted work. The compact + open-slot dance is a single batch:
 *
 *   1. Close the old-position hole   (position > oldPos → position - 1)
 *   2. Open the new-position slot    (position >= newPos → position + 1)
 *   3. Slot the moving row into newPos and touch updatedAt.
 *
 * Steps 1 & 2 explicitly exclude `movingId` so the row we are moving is not
 * shifted twice by its own compact. `newPosition` is clamped to
 * `[0, siblingCount - 1]` because arborist may hand back an out-of-range
 * index while a drag hovers over the last row.
 */
async function reorderWithinParent(
  userId: string,
  movingId: number,
  parentId: number | null,
  oldPosition: number,
  newPositionRaw: number,
): Promise<MoveTodoResult> {
  const siblingRows = await executeD1Query<{ id: number; position: number }>(
    `SELECT id, position FROM todos
      WHERE user_id = ? AND parent_id IS ?
      ORDER BY position, id`,
    [userId, parentId],
  );
  const siblingCount = siblingRows.length;
  const maxIndex = Math.max(0, siblingCount - 1);
  const newPosition = Math.min(Math.max(0, newPositionRaw), maxIndex);
  const now = Date.now();

  if (newPosition === oldPosition) {
    // No-op reorder; still touch updatedAt on the row so downstream sorts
    // reflect the intent — matches how a text edit would flow.
    await executeD1Query(
      `UPDATE todos SET updated_at = ? WHERE id = ? AND user_id = ?`,
      [now, movingId, userId],
    );
    return {
      movedId: movingId,
      oldParentId: parentId,
      newParentId: parentId,
      oldParentSiblings: siblingRows.map((r) => r.id),
      newParentSiblings: siblingRows.map((r) => r.id),
    };
  }

  const statements: D1Statement[] = [];
  if (newPosition > oldPosition) {
    // Moving down: siblings between (oldPos, newPosition] shift up by one.
    statements.push({
      sql: `UPDATE todos SET position = position - 1
             WHERE user_id = ? AND parent_id IS ? AND id != ?
               AND position > ? AND position <= ?`,
      params: [userId, parentId, movingId, oldPosition, newPosition],
    });
  } else {
    // Moving up: siblings in [newPosition, oldPos) shift down by one.
    statements.push({
      sql: `UPDATE todos SET position = position + 1
             WHERE user_id = ? AND parent_id IS ? AND id != ?
               AND position >= ? AND position < ?`,
      params: [userId, parentId, movingId, newPosition, oldPosition],
    });
  }
  statements.push({
    sql: `UPDATE todos SET position = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND parent_id IS ?`,
    params: [newPosition, now, movingId, userId, parentId],
  });
  if (parentId !== null) {
    statements.push({
      sql: `UPDATE todos SET updated_at = ? WHERE id = ? AND user_id = ?`,
      params: [now, parentId, userId],
    });
  }

  await executeD1Batch(statements);

  const finalSiblings = await executeD1Query<{ id: number }>(
    `SELECT id FROM todos
      WHERE user_id = ? AND parent_id IS ?
      ORDER BY position, id`,
    [userId, parentId],
  );
  const orderedIds = finalSiblings.map((r) => r.id);
  return {
    movedId: movingId,
    oldParentId: parentId,
    newParentId: parentId,
    oldParentSiblings: orderedIds,
    newParentSiblings: orderedIds,
  };
}

/**
 * Reparent + reposition a todo. Contract per docs/21-todos-feature.md
 * "Move (contract)" — two-phase safe-tail write with write-time ancestry
 * and depth guards on committed state:
 *
 *   Phase 1 (preflight)  — one SELECT: moving row + subtree height.
 *   Phase 2 (guarded)    — one guarded UPDATE that parks the moving row at
 *                          the tail of the target parent's siblings; the
 *                          `WHERE` clause runs the ancestry + depth check
 *                          against committed state via a recursive CTE. On
 *                          empty RETURNING the whole move aborts with no
 *                          reconcile writes and no drift.
 *   Phase 3 (reconcile)  — one batch: close the old-parent hole, open the
 *                          slot at newPosition (guarded on `id != movingId`
 *                          so the safe-tail row is not shifted by its own
 *                          slot-open), relocate the moving row from tail to
 *                          newPosition (guarded on the tail position value
 *                          so a concurrent op cannot get us to overwrite
 *                          someone else's write), and touch old + new
 *                          parents' updatedAt (dedupe on equality; skip
 *                          when null).
 *   Phase 4 (result)     — SELECT both parents' new sibling ids for the
 *                          returned slice.
 *
 * Same-parent moves route to `reorderWithinParent` above; the cycle SQL is
 * unnecessary there and would only slow the drag.
 */
export async function moveTodo(
  userId: string,
  id: number,
  input: MoveTodoInput,
): Promise<MoveTodoResult> {
  const newParentId = input.parentId;
  const newPositionRaw = input.position;

  if (newParentId === id) {
    // Self-parent — cheapest fast-fail; also caught by write-time guard
    // (the moving id would appear in the ancestors CTE and NOT EXISTS
    // would fail), but rejecting here is clearer for callers.
    throw new TodoMoveConflictError();
  }

  const preflight = await movePreflight(userId, id);
  if (!preflight) throw new TodoNotFoundError();

  // Same-parent reorder — different SQL path, no cycle/depth checks needed.
  if (preflight.oldParentId === newParentId) {
    return reorderWithinParent(
      userId,
      id,
      newParentId,
      preflight.oldPosition,
      newPositionRaw,
    );
  }

  const now = Date.now();
  const oldParentId = preflight.oldParentId;
  const oldPosition = preflight.oldPosition;
  const movingSubtreeHeight = preflight.movingSubtreeHeight;

  // --- Phase 2: guarded UPDATE parking at the safe tail. --------------------
  //
  // Two shapes of predicate in one statement:
  //   * new parent == NULL (root)  — no ancestors query needed; just check
  //                                   subtreeHeight + 1 <= maxDepth.
  //   * new parent != NULL         — recursive CTE over the new parent's
  //                                   ancestry; reject on cycle or depth.
  //
  // The `parent_id` write uses the same `IS ?` NULL-safe compare as the
  // `MAX(position)` subquery so both branches share one code path.
  const guardedUpdateSql = `
    WITH RECURSIVE ancestors(id, parent_id, depth) AS (
      SELECT id, parent_id, 1 FROM todos
       WHERE id = ? AND user_id = ?
      UNION ALL
      SELECT t.id, t.parent_id, a.depth + 1
        FROM todos t JOIN ancestors a ON t.id = a.parent_id
       WHERE t.user_id = ? AND a.depth < ?
    )
    UPDATE todos
       SET parent_id = ?,
           position = COALESCE(
             (SELECT MAX(position) + 1 FROM todos
               WHERE user_id = ? AND parent_id IS ?),
             0
           ),
           updated_at = ?
     WHERE id = ? AND user_id = ?
       AND (
         (? IS NULL AND ? + 1 <= ?)
         OR (
           ? IS NOT NULL
           AND EXISTS (SELECT 1 FROM ancestors WHERE id = ?)
           AND NOT EXISTS (SELECT 1 FROM ancestors WHERE id = ?)
           AND (SELECT MAX(depth) FROM ancestors) + ? + 1 <= ?
         )
       )
     RETURNING position`;

  const guardParams: unknown[] = [
    // ancestors CTE anchor
    newParentId,
    userId,
    // ancestors CTE recursion guard
    userId,
    MAX_TODO_DEPTH + 1,
    // SET parent_id
    newParentId,
    // MAX(position) subquery — target parent
    userId,
    newParentId,
    // updated_at
    now,
    // WHERE id/user
    id,
    userId,
    // root-branch guard: (? IS NULL AND ? + 1 <= ?)
    newParentId,
    movingSubtreeHeight,
    MAX_TODO_DEPTH,
    // subtree-branch guard: (? IS NOT NULL ...)
    newParentId,
    newParentId, // EXISTS anchor check
    id, // NOT EXISTS — moving id in ancestors
    movingSubtreeHeight,
    MAX_TODO_DEPTH,
  ];

  const guardedResult = await executeD1Query<{ position: number }>(
    guardedUpdateSql,
    guardParams,
  );
  const guardedRow = guardedResult[0];
  if (!guardedRow) {
    throw new TodoMoveConflictError();
  }
  const tailPosition = guardedRow.position;

  // --- Phase 3: reconcile batch. --------------------------------------------
  //
  // Every write here is gated by the same "moving row is still parked at
  // its Phase 2 safe-tail slot in the target parent" predicate. If a racing
  // operation nudged the moving row between Phase 2 and Phase 3, all the
  // sibling-shifting writes become no-ops, the relocate returns zero rows,
  // and the whole move aborts with `TodoMoveConflictError` — no sibling
  // positions or parent `updated_at` drift the way v1.3 warns against.
  //
  // Statement order (locked; do not reshuffle without re-thinking guards):
  //   1. close hole in old-parent siblings  (position > oldPosition ↓1)
  //   2. open slot in new-parent siblings   (position >= newPosition ↑1,
  //                                          exclude moving row via id != ?)
  //   3. touch old-parent + new-parent updatedAt (dedupe when equal, skip
  //      when null) — before relocate so a Phase 3 abort leaves the
  //      timestamps unchanged.
  //   4. relocate moving row from tail → newPosition, `RETURNING id`.
  //
  // The moving row's own `updated_at` was set in Phase 2; touching it here
  // would only bump the timestamp by a millisecond within the same move.
  const newSiblingCount = await executeD1Query<{ cnt: number }>(
    `SELECT COUNT(1) AS cnt FROM todos
      WHERE user_id = ? AND parent_id IS ?`,
    [userId, newParentId],
  );
  const totalNewSiblings = (newSiblingCount[0]?.cnt as number | undefined) ?? 0;
  // totalNewSiblings already counts the moving row (parked at tail). The
  // usable index range for a new position is [0, totalNewSiblings - 1].
  const maxNewIndex = Math.max(0, totalNewSiblings - 1);
  const newPosition = Math.min(Math.max(0, newPositionRaw), maxNewIndex);

  // `moving-still-parked` SQL fragment reused as a WHERE-suffix on every
  // Phase 3 write. Parameters (in order): movingId, userId, newParentId,
  // tailPosition. Reusing the string keeps every write gated by the exact
  // same predicate, so a lost race no-ops them uniformly rather than
  // leaving half the batch applied.
  const stillParkedSql = `AND EXISTS (
    SELECT 1 FROM todos
     WHERE id = ?
       AND user_id = ?
       AND parent_id IS ?
       AND position = ?
  )`;
  const stillParkedParams: unknown[] = [id, userId, newParentId, tailPosition];

  const batch: D1Statement[] = [];

  // 1. Close the hole in the old parent's siblings, guarded on still-parked.
  batch.push({
    sql: `UPDATE todos SET position = position - 1
           WHERE user_id = ? AND parent_id IS ? AND position > ?
           ${stillParkedSql}`,
    params: [userId, oldParentId, oldPosition, ...stillParkedParams],
  });

  if (newPosition < tailPosition) {
    // 2. Open a slot at newPosition among the target parent's other
    //    siblings; guard on `id != movingId` so the safe-tail row is not
    //    shifted by its own open-slot update, AND on still-parked so a
    //    lost race does not shuffle innocent siblings.
    batch.push({
      sql: `UPDATE todos SET position = position + 1
             WHERE user_id = ? AND parent_id IS ? AND id != ?
               AND position >= ? AND position < ?
               ${stillParkedSql}`,
      params: [
        userId,
        newParentId,
        id,
        newPosition,
        tailPosition,
        ...stillParkedParams,
      ],
    });
  }
  // If newPosition == tailPosition, Phase 2 already parked the row exactly
  // where the caller wants it — no slot-open needed. The relocate below
  // still runs so the final `RETURNING id` doubles as our success signal.

  // 3. updatedAt touches on old + new parent (dedupe on equality; skip
  //    when null), each guarded on still-parked.
  const parentTouches = new Set<number>();
  if (oldParentId !== null) parentTouches.add(oldParentId);
  if (newParentId !== null) parentTouches.add(newParentId);
  for (const pid of parentTouches) {
    batch.push({
      sql: `UPDATE todos SET updated_at = ?
             WHERE id = ? AND user_id = ? ${stillParkedSql}`,
      params: [now, pid, userId, ...stillParkedParams],
    });
  }

  // 4. Relocate moving row tail → newPosition. This is the authoritative
  //    success signal for Phase 3 — empty RETURNING means the safe-tail
  //    guard failed (someone else moved the row concurrently); we abort
  //    and let the client refetch. The `position = :tailPosition`
  //    predicate is redundant with the still-parked EXISTS check above but
  //    tightens the self-guard: even if all the earlier statements no-oped
  //    on a lost race, this final UPDATE must not overwrite whatever the
  //    winning operation wrote.
  batch.push({
    sql: `UPDATE todos SET position = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND parent_id IS ?
             AND position = ?
           RETURNING id`,
    params: [newPosition, now, id, userId, newParentId, tailPosition],
  });

  const batchResults = await executeD1Batch<{ id: number }>(batch);
  const relocateResult = batchResults[batchResults.length - 1] ?? [];
  if (relocateResult.length === 0) {
    // The moving row is no longer where Phase 2 parked it. Because every
    // earlier statement in the batch shared the same still-parked EXISTS
    // predicate, none of them mutated anything either. Surface a conflict
    // so the client refetches; no drift left behind.
    throw new TodoMoveConflictError();
  }

  // --- Phase 4: return the affected slice. -----------------------------------
  const [oldSiblingRows, newSiblingRows] = await Promise.all([
    executeD1Query<{ id: number }>(
      `SELECT id FROM todos
        WHERE user_id = ? AND parent_id IS ?
        ORDER BY position, id`,
      [userId, oldParentId],
    ),
    executeD1Query<{ id: number }>(
      `SELECT id FROM todos
        WHERE user_id = ? AND parent_id IS ?
        ORDER BY position, id`,
      [userId, newParentId],
    ),
  ]);

  return {
    movedId: id,
    oldParentId,
    newParentId,
    oldParentSiblings: oldSiblingRows.map((r) => r.id),
    newParentSiblings: newSiblingRows.map((r) => r.id),
  };
}

/* -------------------------------------------------------------------------- */
/* Same-parent reorder (public API)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Batch reorder within a single parent, driven by the client's desired
 * order. Used by DnD when the operation is pure reorder (parent unchanged);
 * `moveTodo` also delegates to this shape internally. `orderedIds` MUST be
 * the complete post-reorder id list for `parentId`: every existing sibling
 * must appear exactly once and nothing else may appear. A partial or stale
 * id set is rejected with `TodoMoveConflictError` — writing positions from
 * a short list would leave the untouched siblings' positions unchanged and
 * silently produce duplicate `position` values inside `(userId, parentId)`.
 */
export async function reorderSiblings(
  userId: string,
  parentId: number | null,
  orderedIds: readonly number[],
): Promise<number[]> {
  // Enumerate the parent's committed sibling ids and cross-check against
  // the caller's ordering. Doing this in a single SELECT keeps the check
  // atomic against the write we're about to issue (the batch runs under
  // one D1 batch atomicity later); the input `orderedIds` is validated
  // against exactly the same snapshot we're about to rewrite.
  const siblingRows = await executeD1Query<{ id: number }>(
    `SELECT id FROM todos
      WHERE user_id = ? AND parent_id IS ?
      ORDER BY position, id`,
    [userId, parentId],
  );
  const siblingIds = new Set(siblingRows.map((r) => r.id));

  // Empty input is only valid when the parent has no siblings at all
  // — otherwise it would silently blow away the reorder attempt.
  if (orderedIds.length === 0) {
    if (siblingIds.size !== 0) {
      throw new TodoMoveConflictError(
        'reorderSiblings: orderedIds is empty but parent has children',
      );
    }
    return [];
  }

  const orderedSet = new Set(orderedIds);
  if (orderedSet.size !== orderedIds.length) {
    throw new TodoMoveConflictError('reorderSiblings: orderedIds contains duplicates');
  }
  if (orderedSet.size !== siblingIds.size) {
    throw new TodoMoveConflictError(
      'reorderSiblings: orderedIds does not cover every sibling of the parent',
    );
  }
  for (const childId of orderedIds) {
    if (!siblingIds.has(childId)) {
      throw new TodoMoveConflictError(
        'reorderSiblings: orderedIds references an id outside this parent',
      );
    }
  }

  const now = Date.now();
  const statements: D1Statement[] = orderedIds.map((childId, index) => ({
    sql: `UPDATE todos SET position = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND parent_id IS ?`,
    params: [index, now, childId, userId, parentId],
  }));
  if (parentId !== null) {
    statements.push({
      sql: `UPDATE todos SET updated_at = ? WHERE id = ? AND user_id = ?`,
      params: [now, parentId, userId],
    });
  }
  await executeD1Batch(statements);

  return [...orderedIds];
}
