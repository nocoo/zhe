# TODO Feature

> **Status**: Design (v1.3). Change Log at the bottom.

---

## Overview

`Todo` is a new dashboard module for hierarchical task lists. It lives **beside** — not inside — Ideas: same "personal capture" surface area, different affordances (structure, actionability, drag-and-drop).

The core distinguisher vs. Ideas is **shape**:

- **Ideas** = flat list of Markdown notes, tagged for retrieval.
- **Todos** = a *forest* of todos: multiple root nodes (like top-level projects), each with an arbitrary-depth subtree.

Each todo has:
- **Title** (required, plain text)
- **Content** (optional, Markdown — same renderer as Ideas)
- **Tags** (free-form strings, per-todo namespace, hash-derived colour)
- **Parent** / **children** (a single-parent tree edge)
- **Ordering** among siblings (drag to reorder)
- **Done** state (checkbox; done state does not delete)
- **Due date** (optional timestamp; UI decorates rows with time-relative status)

```
┌─────────────────────────────────────────────────────────────────┐
│                          Todos                                   │
├─────────────────────────────────────────────────────────────────┤
│  Core Features:                                                  │
│  • Forest of trees (multiple root nodes = projects)             │
│  • Arbitrary-depth nesting                                       │
│  • Inline rename + drag-to-nest / reorder                       │
│  • Right pane = Markdown content, opens on selection            │
│  • Free-form tags, hash-derived colour (per-tag)                │
│  • Todo-namespaced tags (independent of `tags` table)           │
│  • Optional due date (Overdue / Today / Tomorrow / date chip)   │
├─────────────────────────────────────────────────────────────────┤
│  Entry Points:                                                   │
│  • Dashboard: /dashboard/todos                                  │
│  • Sidebar: "待办" entry in the "概览" group                     │
│  • Global Search (Cmd+K): title + excerpt of Markdown           │
│  • CLI: `zhe todo add|list|get|update|delete|move` (v2, later)  │
│  • API v1: `/api/v1/todos` (v2, later)                          │
└─────────────────────────────────────────────────────────────────┘
```

**Layout target** (哥 explicit ask): a two-pane workspace — **left = full tree with inline edit, right = Markdown content of the selected todo**.

---

## Design Principles

1. **Structure-first**: The tree *is* the primary organisation. Tags are a secondary filter, not a substitute for hierarchy.
2. **Actionable capture**: Todos carry a `done` state; adding a todo, checking it, and dragging it under a parent are one-click operations.
3. **Minimum friction to edit**: The tree is the working surface. Rename in-place (Enter to confirm, Esc to cancel), edit content in the right pane, no modal round-trip for the common path.
4. **Predictable movement**: Drag-and-drop between siblings, into a parent, out to root. Keyboard equivalents cover the same operations for accessibility.
5. **Free-form tags, hash colour**: A tag is just a string; colour is computed deterministically from the tag string, not stored. Reflects 哥's "书签 tag 之外" ask — no cross-contamination with the curated `tags` table.
6. **Guarded server mutations**: parent change, reorder, and rename go through write-time-guarded UPDATEs so the client never observes torn state; see [Move (contract)](#move-contract). Not a SQL transaction — D1 does not expose one.
7. **Reversible done**: A checked todo remains visible (dimmed) under its parent; there is no auto-archive. Deletion is a separate destructive action.
8. **Parallel to Ideas, not a subtype**: Todos and Ideas are independent tables, endpoints, ViewModels. No shared server logic beyond the standard scoping/auth pattern.

---

## Data Model

### `todos` table (Drizzle, next migration slot `0021_add_todos.sql`)

```ts
export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: integer("parent_id"),                          // self-ref, NULL = root
  position: integer("position").notNull(),                 // dense order within (userId, parentId)
  title: text("title").notNull(),
  content: text("content"),                                // optional Markdown
  excerpt: text("excerpt"),                                // first 200 chars, plain text (same rule as ideas)
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  doneAt: integer("done_at", { mode: "timestamp" }),       // when done flipped true; null when not done
  dueAt: integer("due_at", { mode: "timestamp" }),         // optional due date (v1 added, see "Due Date")
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  parentFk: foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
  }).onDelete("cascade"),
  userParentIdx: index("idx_todos_user_parent").on(table.userId, table.parentId),
  userUpdatedIdx: index("idx_todos_user_updated").on(table.userId, table.updatedAt),
  userDoneIdx: index("idx_todos_user_done").on(table.userId, table.done),
  userDueIdx: index("idx_todos_user_due").on(table.userId, table.dueAt),
}));
```

Key choices:

- **Self-referential `parentId`** (adjacency list). Chosen over closure table / nested-set for CRUD simplicity; D1 workloads here are ≪ 10k rows per user, so the recursive-query cost is negligible.
- **`position: integer`** — dense integer ordering within `(userId, parentId)`. Reorders rewrite affected siblings' positions in a single batch; this is simpler than the fractional-index approach and D1's `executeD1Batch` handles the batch atomically. Client-side "optimistic" reordering can use fractional index locally for the drag preview then reconcile after the server response.
- **`done` + `doneAt`** — `doneAt` records when the flag flipped to `true`, cleared when it flips back. Enables "recently completed" and "completed this week" queries later without a separate history table.
- **`dueAt`** — optional, **date-only in v1**. Stored as **absolute UTC timestamp** (same encoding as every other timestamp column in the schema); the client resolves a picked date to local end-of-day, converts to UTC, and sends that value. Overdue detection compares against `startOfToday(local)`, not `now()`, so the whole calendar day counts. Details in [Due Date](#due-date). Clearing = set `NULL`; index `idx_todos_user_due` supports the "upcoming" list. date-time precision deferred to v2 (see the v2 upgrade path at the bottom of the Due Date section).
- **Cascade delete on parent**: deleting a parent hides the subtree in one operation. Confirmation must state the subtree count (see [UI Design](#ui-design)).
- **No text FK to `users`** on `parentId` — one column, one column type, matches Ideas' relationship shape.

### `todo_tags` table

Free-form tags, **not** joined to `tags` — 哥 explicitly asked for a namespace separate from bookmark tags. Simplest fit: store the tag string on the join row directly (no separate `todo_tag_names` table), keyed by `(todoId, name)`.

```ts
export const todoTags = sqliteTable("todo_tags", {
  todoId: integer("todo_id").notNull().references(() => todos.id, { onDelete: "cascade" }),
  name: text("name").notNull(),                            // canonical lowercase
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  compositePk: primaryKey({ columns: [table.todoId, table.name] }),
}));
```

- Name is canonicalised to lowercase before insert so `"Urgent"` and `"urgent"` collide.
- No `id` column — the natural PK is `(todoId, name)`. All lookups are by todoId or by name+userId (via the `todos.userId` join).
- **Distinct tag list per user** is a `SELECT DISTINCT name FROM todo_tags tt JOIN todos t ON t.id = tt.todo_id WHERE t.user_id = ?` — no separate cache table.

### Cycle & depth guards (server-side, MUST enforce)

Adjacency list allows cycles if the API takes an unchecked `parentId`. Any mutation that sets `parentId` must:

1. Reject if `parentId == id`.
2. Reject if the moving row's id would appear in the target parent's ancestry chain (would create a cycle).
3. Reject if the resulting depth would exceed `MAX_TODO_DEPTH = 12`.

**Execution model** (v1.2 修订, Reviewer round-2 #1 + round-3 #1). D1 does not expose a JS-visible transaction, only fixed-SQL batches. Two problems must be handled:

1. **Preflight-only is racy**: two concurrent moves can each preflight-validate against the old tree and both succeed, jointly producing a cycle (`A → 1 under 2`, `B → 2 under 1`; each `UPDATE ... WHERE user_id = ?` matches, and the tree ends up with 1↔2).
2. **Depth cap must consider moving-subtree height**: even when the target parent's own depth is legal, moving a tall subtree under a moderately-deep parent can push descendants past `MAX_TODO_DEPTH`.

Both are solved by moving the check into the `UPDATE` itself, evaluating against **committed database state at write time**. The v1.2 statement takes the moving-subtree height (`:movingSubtreeHeight`, computed by the server preflight in the same round-trip) as a parameter and rejects if `newParent depth + movingSubtreeHeight + 1 > MAX_TODO_DEPTH`:

```sql
-- moveTodo — parent-update guarded by ancestry + depth (incl. moving subtree height) at write time.
-- If RETURNING id is empty, the server surfaces a conflict and NO other write happens.
-- Runs on its own via executeD1Query; the sibling-compact reconcile writes are a
-- SEPARATE batch that only runs on success (see Move (contract)).
WITH RECURSIVE ancestors(id, parent_id, depth) AS (
  SELECT id, parent_id, 1 FROM todos
   WHERE id = :newParentId AND user_id = :userId          -- 0 rows if newParent gone / wrong user
  UNION ALL
  SELECT t.id, t.parent_id, a.depth + 1
    FROM todos t JOIN ancestors a ON t.id = a.parent_id
   WHERE t.user_id = :userId AND a.depth < :maxDepth
)
UPDATE todos
   SET parent_id = :newParentId,
       -- Park at the *tail* of the target parent's siblings so we never
       -- collide with an existing position. Phase 3 relocates to :newPosition
       -- inside the same reconcile batch. A crash between phases leaves the
       -- moving row at the tail, valid dense order preserved for the target
       -- parent; only the old parent has a one-slot gap.
       position   = COALESCE(
         (SELECT MAX(position) FROM todos
           WHERE user_id = :userId AND parent_id IS :newParentId),
         -1
       ) + 1,
       updated_at = :now
 WHERE id = :movingId
   AND user_id = :userId
   AND (
     :newParentId IS NULL                                       -- moving to root
     AND :movingSubtreeHeight + 1 <= :maxDepth                  -- subtree still fits below root
     OR (
       EXISTS (SELECT 1 FROM ancestors WHERE id = :newParentId) -- newParent exists (owned by user)
       AND NOT EXISTS (SELECT 1 FROM ancestors WHERE id = :movingId) -- would-be cycle blocked
       AND (
         SELECT MAX(depth) FROM ancestors                       -- deepest ancestor row = newParent depth
       ) + :movingSubtreeHeight + 1 <= :maxDepth                -- subtree still fits after move
     )
   )
 RETURNING id;
```

If `RETURNING id` yields 0 rows, one of: (a) `movingId` gone or wrong user, (b) `newParentId` gone or wrong user, (c) placing the moving subtree here would form a cycle, or (d) resulting depth would exceed the cap. The server returns `ActionResult.error = "Move conflicted or invalid"` and the client refetches. **Nothing else has been written** at this point — sibling compact and `updatedAt` touches live in a separate batch that only runs after this UPDATE succeeds (see [Move (contract)](#move-contract)).

**Preflight remains** (fast-fail, no round-trip on the hot path when the client already knows the answer): the client computes ancestry from its own tree copy and refuses to submit obviously-invalid moves. But preflight is **advisory only** — the write-time guard is authoritative.

**`:movingSubtreeHeight` derivation** (server preflight, same round-trip as sibling-position lookup):

```sql
WITH RECURSIVE descendants(id, depth_below_moving) AS (
  SELECT id, 0 FROM todos WHERE id = :movingId AND user_id = :userId
  UNION ALL
  SELECT t.id, d.depth_below_moving + 1
    FROM todos t JOIN descendants d ON t.parent_id = d.id
   WHERE t.user_id = :userId AND d.depth_below_moving < :maxDepth
)
SELECT COALESCE(MAX(depth_below_moving), 0) AS moving_subtree_height FROM descendants;
```

**What "atomic" means here**. Individual `executeD1Batch` calls are atomic *for their own writes*, but D1 provides no read-check-write transaction, so the whole move is **not** one atomic unit. Vocabulary throughout this document:

- "batch" = one `executeD1Batch` set of statements, all-or-nothing.
- "write-time guard" = an SQL predicate on committed state evaluated at UPDATE time.
- **Not** "transaction" — we do not have one in the SQL-transactional sense.
- The move contract enforces safety by making the *guarded parent UPDATE* the only statement that can violate an invariant; every other write is a guarded no-op-on-conflict reconcile step.

**Test coverage** (L1 unit + L2 integration):

- Cross-move race: interleave two `moveTodo` calls that would each individually be legal on the preflight snapshot but jointly create a cycle. Assert exactly one succeeds; the other returns the conflict error; DB post-condition has no cycle.
- Parent deleted mid-move: `newParent` disappears between preflight and the guarded UPDATE — `RETURNING id` is empty, error returned.
- Depth-cap race: move a subtree such that the depth becomes 12 legally, then a second concurrent move would push depth to 13 — second UPDATE returns 0 rows.
- **Moving-subtree height overflow**: move a 5-level-tall subtree under a parent at depth 8 (would total depth 13) — `RETURNING id` empty, error returned. Regression for the round-3 gap.
- Cross-user ownership: `newParent` belongs to a different user — 0 rows, error.
- Happy path: legal move → `RETURNING` yields id, sibling compact UPDATEs succeed, tree consistent.

### Data shapes

```ts
/** Lightweight shape for tree rendering. No content, no excerpt. */
export interface TodoTreeNode {
  id: number;
  parentId: number | null;
  position: number;
  title: string;
  done: boolean;
  hasContent: boolean;                                     // true when content !== null
  tagNames: string[];                                      // canonicalised
  dueAt: Date | null;                                      // v1: due-date decoration on tree rows
  createdAt: Date;
  updatedAt: Date;
}

/** Detail shape for the right-pane content view. */
export interface TodoDetail extends TodoTreeNode {
  content: string | null;                                  // full Markdown
  excerpt: string | null;
  doneAt: Date | null;
}
```

`hasContent` on the tree node lets the tree row render a "has notes" glyph without pulling the full Markdown for every visible row. `dueAt` lives on both shapes because the tree row displays the due chip inline.

---

## ScopedDB Methods

Add to `lib/db/scoped/todos.ts` (mirrors `lib/db/scoped/ideas.ts` layout).

| Method | Description |
|--------|-------------|
| `getTodos()` | Fetch **all** todos for the user in tree shape (single query, sorted `(parentId, position)`; client assembles the forest). |
| `getTodoById(id)` | Fetch a single todo detail with `content` + tags. |
| `createTodo({title, parentId?, content?, tagNames?})` | Insert todo at end of siblings, atomic tag insert. Cycle & depth pre-check. |
| `updateTodo(id, {title?, content?, done?, tagNames?})` | Content / metadata edits. Tags replace-all when provided. Touch `updatedAt`. Toggle `doneAt` on `done` change. |
| `moveTodo(id, {parentId, position})` | Reparent + reorder. Two-phase write: guarded parent UPDATE (cycle + depth + ownership evaluated on committed state at write time) followed by a reconcile batch of guarded sibling-position and `updatedAt` UPDATEs. See [Move (contract)](#move-contract). |
| `reorderSiblings(parentId, orderedIds[])` | Batch reorder within a single parent (used by DnD when only reordering, not reparenting). |
| `deleteTodo(id)` | Cascade delete via FK. Returns the count of removed rows. |

### Move (contract)

`moveTodo` is the highest-risk operation. v1 contract — **two-phase write with write-time ancestry+depth guard** (v1.2 修订, Reviewer round-3 #1). Explicitly **not** one atomic transaction across the whole move: D1 has no such thing, and the previous "single batch, harmless drift on failure" was wrong.

**Phase 0 — client-side preflight** (advisory only, non-authoritative)
- Client walks its local tree copy and refuses to submit trivially-invalid moves (`parentId == id`, obvious cycle, obvious depth violation).
- Purpose: instant UI feedback + saves round-trips on obvious drags. **Cannot** be relied on for correctness.

**Phase 1 — server-side preflight** (single `SELECT`, no writes)
- One recursive-CTE round-trip returns: `movingRow` (assert exists + user_id), `oldParent`, `oldSiblingPositions`, `newSiblingPositions`, and the **height of the moving subtree** `movingSubtreeHeight = MAX(depth-below-moving)`. Height is required because a tall subtree can push descendants past `MAX_TODO_DEPTH` even when the target parent's own depth is legal.
- Application-code fast-fail on: self-parent, obviously wrong ownership, `newParentDepth + 1 + movingSubtreeHeight > MAX_TODO_DEPTH`. This is defence-in-depth; Phase 2 re-checks against committed state.

**Phase 2 — guarded parent UPDATE + safe-tail position** (single statement, its own `executeD1Query`)
- Runs the `WITH RECURSIVE ... UPDATE ... WHERE NOT EXISTS(movingId in newAncestors) AND MAX(depth) + :movingSubtreeHeight + 1 <= :maxDepth RETURNING id` from [Cycle & depth guards](#cycle--depth-guards-server-side-must-enforce). The guard is authoritative on committed state, so it wins the race that broke v1.
- **The `position` value written in Phase 2 is NOT `:newPosition`**. It is `:tailPosition`, a value known to not collide with any existing sibling of the target parent — specifically `(SELECT COALESCE(MAX(position), -1) + 1 FROM todos WHERE user_id = :userId AND parent_id IS :newParentId)`, computed inline in the same UPDATE. This guarantees the moving row lands at the end of the target parent's sibling list without duplicating any existing `position`. Phase 3 will slot it into `:newPosition` when it also compacts the surrounding siblings.
- If `RETURNING id` is **empty**: server returns `ActionResult.error = "Move conflicted or invalid"` and the client refetches. **No sibling compact, no `updatedAt` touches, no returned slice.** Nothing else has been written; there is no drift to reconcile.

**Phase 3 — reconcile writes** (only reached when Phase 2 succeeded, single `executeD1Batch`)
- Old-parent siblings: fill the hole left by the moving row (`WHERE user_id = ? AND parent_id = :oldParent AND position > :oldPosition → position - 1`).
- New-parent siblings: open the slot at `:newPosition` (`WHERE user_id = ? AND parent_id = :newParentId AND id != :movingId AND position >= :newPosition → position + 1`). Guarding on `id != :movingId` protects against the safe-tail row being shifted by its own open-slot update.
- Moving row: `UPDATE todos SET position = :newPosition WHERE id = :movingId AND user_id = ? AND parent_id = :newParentId AND position = :tailPositionFromPhase2`. The final `position = :tailPositionFromPhase2` predicate ensures the row we relocate is the one Phase 2 just parked — if a concurrent operation has touched it, this UPDATE is a no-op and the client refetches.
- `updatedAt` touches: `oldParent` (skip if `null`), `newParent` (skip if `null`); dedupe when old == new. The moving row's `updatedAt` was already set in Phase 2.
- All statements batch together; D1 gives us atomic-per-batch semantics for the reconcile phase.

**Phase 4 — return the affected slice** (single `SELECT`)
- Returns moving node + both parents' post-move sibling orders, so the client rebuilds without a full refetch.

**What this is and is not**:

- ✅ Phase 2 is authoritative on cycles / depth / ownership at commit time.
- ✅ On Phase 2 failure, no writes happen and there is nothing to undo.
- ✅ Phase 3's batch is atomic for the reconcile writes.
- ❌ Phases 2 + 3 are **not** one SQL transaction. But because Phase 2 parks the moving row at a **safe tail position** in the target parent, a crash between phases leaves:
  - the target parent with the moving row appended at its tail (valid dense ordering — no duplicated `position`),
  - the old parent with a one-slot hole in its dense ordering (invariant *briefly* violated by exactly one gap on one parent),
  - no cycles and no depth-cap violations.
  The next `moveTodo` targeting either affected parent will re-establish density through its own Phase 3 open-slot / hole-fill UPDATEs. Even if no such move occurs, the tree is fully functional — sorting is unaffected because SQL uses `ORDER BY position` and gaps do not disrupt order, only compactness. If we later want an eager reconcile, add a "compact-siblings" opportunistic pass to `getTodos()` — noted as v2 optional; **not** shipped in v1.
- ❌ We deliberately do not use the single-batch "run everything, inspect RETURNING later" pattern from earlier drafts because it would allow sibling positions or parent `updatedAt` to drift on a conflicted move.

Reviewer-locked semantics (see [Design Decisions](#design-decisions-summary)): `updatedAt` touches only the moving row + old parent + new parent — **not the whole subtree**. Skip when parent is `null`; dedupe when old == new.

### Excerpt generation

Reuse existing `stripMarkdown()` from `lib/markdown.ts` (added for Ideas). Same 200-char plaintext excerpt rule.

---

## Due Date

`dueAt` is optional per todo. Ships in v1 (追加于哥 2026-07-10 需求). **v1 is date-only**; a full date-time deadline picker is deferred to v2 (see below). Rules:

### Storage

- Column: `todos.due_at INTEGER NULL` (Drizzle: `integer("due_at", { mode: "timestamp" })`), same encoding as every other timestamp in the schema (Unix ms, absolute UTC).
- The stored value is always **end-of-day in the user's local timezone, converted to UTC**. This means the column semantic is "the day this todo is due" — not "the specific instant it is due".
- `NULL` = no due date.

Rationale for date-only (v1.1 修订, Reviewer round-2 #2): mixing date-only and date-time in one column with heuristics for overdue detection is fragile — DST boundaries and user edits break it. "Due Date" as a product noun matches the calendar-day story; if a user needs "reminded at 3pm Friday" that is a reminder feature and belongs to v2.

### Input semantics

Single input: **date-only picker** (calendar). The client resolves the selected date to `23:59:59.999` in the user's local timezone, converts to UTC, and sends the resulting timestamp. The picker does not expose a time-of-day input in v1.

**Clearing**: an explicit "Clear" button on the picker sends `null`; no keyboard shortcut deletes the due date to avoid accidental clears.

### Display semantics

Render the due status client-side. The status is derived at read time from `dueAt`, `done`, and `now()`. Because `dueAt` is always stored as local-EOD-UTC, the check compares against **start-of-today in the user's local timezone**:

| Status | Rule (assume `dueAt !== null`) | Chip |
|---|---|---|
| `overdue` | `!done && dueAt < startOfToday(local)` | red pill: `Overdue · Jul 8` |
| `today` | `!done && startOfToday <= dueAt < startOfTomorrow` | amber pill: `Today` |
| `tomorrow` | `!done && startOfTomorrow <= dueAt < startOfDayAfterTomorrow` | amber pill: `Tomorrow` |
| `soon` | `!done && dueAt within 7 days` | neutral pill: `Jul 15` |
| `later` | `!done && dueAt >= 7 days out` | neutral pill: `Aug 3` (drops year unless not-current-year) |
| `done-with-due` | `done` regardless of `dueAt` | grey pill, low emphasis: `Was due Jul 8` |
| `no-due` | `dueAt === null` | no chip |

Because there is no time-of-day, the chip never renders a `HH:mm` suffix in v1.

- `done-with-due` intentionally drops the red emphasis — completed todos should not visually shout regardless of when they were done.

### Placement

- **Tree row**: chip appears after the tag chips, right-aligned before the row menu. Truncates via the same overflow logic as tag chips.
- **Right-pane detail**: a distinct "Due" row above the tag row shows the calendar picker with a "Clear" button. Same chip status renders here in large form.

### Sorting & filtering

- **Filter bar** gains a "Due" facet with three quick filters: `Overdue`, `Today or later`, `No due date`. Multi-select is not in v1.
- Sorting the tree by "Due date ↑" (nulls last) is a v2 enhancement; v1 keeps the natural `(parentId, position)` order because tree structure would otherwise be scrambled.

### Data & tests

- `TodoTreeNode.dueAt` and `TodoDetail.dueAt` (already declared above) drive rendering.
- Chip formatter lives in `lib/todo-due.ts`: `dueStatus(now: Date, dueAt: Date, done: boolean): DueStatus` — pure function, unit-tested.
- Unit tests must cover: `overdue`, `today`, `tomorrow`, `soon`, `later`, `done-with-due`, `no-due`; local end-of-day input round-trip; DST boundary (spring-forward day input yields the correct UTC instant); year-drop formatting rule.
- Playwright E2E: create → set due tomorrow → assert `Tomorrow` chip; toggle done → assert chip becomes low-emphasis.

### v2 upgrade path

When the product needs time-of-day precision (e.g., "meeting at 3pm"), add a `due_precision TEXT NOT NULL DEFAULT 'date'` column (`'date' | 'datetime'`), a follow-up picker mode that exposes hours/minutes, and a branch in `dueStatus` so date-time rows use `dueAt < now()` for overdue. All v1 rows migrate as `precision='date'` with the existing UTC values unchanged.

---

## Route & Page Organisation

- **Sidebar**: append `{ title: "待办", icon: ListTodo, href: "/dashboard/todos" }` to `PRE_LINK_NAV_GROUPS[0].items` (the "概览" group), directly after `想法`. See `components/sidebar-parts/nav-config.ts:56`.
- **Route**: `app/(dashboard)/dashboard/todos/page.tsx` — a thin server component that renders `<TodosPage />`.
- **Client page**: `components/dashboard/todos-page.tsx` — the two-pane workspace.
- **ViewModel**: `viewmodels/useTodosViewModel.ts` + subfolder for slices (`useTodosMutations`, `useTodosFilters`, `useTodosDnd`).

The dashboard-service context (`contexts/dashboard-service-parts/`) currently loads ideas alongside links/tags via `useIdeasSlice`. Add a mirror `useTodosSlice` — this makes the todo tree available to Global Search (Cmd+K) without a second fetch.

---

## UI Control Recommendation

哥's requirement in verbatim: "高级的控件… 便捷的 todo 编辑，例如左侧显示完整的 todo 列表，原地可以编辑，右侧点开再显示内容". This asks for four things at once:

1. Nested tree rendering with expand / collapse.
2. In-place rename (single-line edit).
3. Drag-and-drop reorder & reparent.
4. Right-pane detail linked to selection.

I evaluated the current React ecosystem (versions/dates as of 2026-07-10):

| Library | Version | Last publish | React 19 | Drag & drop | Inline rename | Keyboard | a11y | Virtual | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **`react-arborist`** | 3.13.2 | 2026-07-05 | ✅ peer `>=16.14` | ✅ built-in | ✅ built-in | ✅ built-in | ✅ ARIA | ✅ built-in | **Recommended** |
| `@headless-tree/react` + `@headless-tree/core` | 1.7.0 | 2026-05-17 | ✅ | ✅ (opt-in feature) | ✅ (opt-in feature) | ✅ (opt-in) | ✅ | ✅ (flat-list output; pair w/ TanStack Virtual) | Backup |
| `react-complex-tree` | 2.6.2 | 2026-06-24 | ✅ | ✅ | ✅ (F2) | ✅ | ✅ | ❌ | Backup (author points users at `headless-tree`) |
| `rc-tree` | 5.13.1 | 2025-02 | ✅ (Ant ecosystem) | Basic | ❌ | Partial | Partial | ❌ | Reject: too basic for the interactions needed |
| `@nosferatu500/react-sortable-tree` | 5.0.0 | 2026-02-27 | ✅ | ✅ (react-dnd) | ❌ | Partial | Partial | ❌ | Reject: relies on `react-dnd` (extra dep + double provider), no rename |
| `@dnd-kit/core` + `@dnd-kit/sortable` (roll our own) | 6.3.1 / 10.0.0 | 2024-12 | ✅ | ✅ | Roll own | Roll own | Roll own | Roll own | Reject: too much bespoke code for a v1 |

### Recommendation: `react-arborist`

Reasons in order of weight:

1. **Every哥-required feature is opt-in**: drag/drop nesting + reorder, single-click inline rename, virtualization, keyboard, ARIA attributes, filter — all first-class API without adding sub-libraries.
2. **Controlled mode** (`data` + `onCreate/onRename/onMove/onDelete`) is the only fit for our server-authoritative model. We compute the shape, react-arborist renders + calls back, we call server actions, we re-fetch. Matches the pattern already in `useIdeasViewModel`.
3. **Bundle**: five dependencies, MIT, TypeScript. No `react-dnd` chain.
4. **Recently maintained**: latest publish 2026-07-05, so it is being touched during the current React 19 era.
5. **Live production reference**: the author uses it for the Zui desktop app's file/query sidebar; the same shape as a todo project sidebar.

### Backup: `@headless-tree/react`

If Reviewer objects to react-arborist's opinionated styling or wants fully custom rendering, `@headless-tree/react` is the strongest backup: newer (2026-05), zero dependencies, explicitly headless, ~9.5 KB gzip, and pairs cleanly with our existing shadcn/ui primitives. The trade-off is: we own row rendering, focus management, and drag preview, which triples the client code volume for a v1.

Decision path: pick react-arborist for v1. If a later polishing pass finds we're fighting arborist's DOM structure or styling defaults, migrate to `@headless-tree/react` — the ViewModel contract (server-authoritative, `TodoTreeNode` shape) is identical.

### Reject: DIY on `@dnd-kit`

Reviewer should not be tempted to build this from `@dnd-kit/sortable` alone. Sortable is single-level; nested sortable requires bespoke drop-zone geometry, indent-drag detection, focus management, and virtualisation glue. React-arborist already ships this; DIY would spend ~2 weeks re-inventing it.

---

## Tag Colour Rule

Free-form tags with hash colour, in `lib/todo-tag-color.ts`:

```ts
// Deterministic hue from tag name; saturation + lightness locked so the palette
// stays cohesive with the rest of the dashboard.
export function todoTagColor(name: string): { bg: string; fg: string; border: string } {
  const hash = fnv1a(name.toLowerCase());
  const hue = hash % 360;
  return {
    bg:     `hsl(${hue} 60% 92%)`,
    fg:     `hsl(${hue} 45% 25%)`,
    border: `hsl(${hue} 55% 70%)`,
  };
}
```

- `fnv1a` (32-bit FNV) is small and deterministic. Same tag name → identical colour across sessions and users.
- Saturation/lightness fixed → guarantees text contrast (WCAG AA at 60/45/25).
- **Dark mode**: swap `bg` and `fg` levels via CSS var. Concrete tokens ship as CSS custom properties so both modes share the hue.
- No server state — colour is a pure function.

---

## UI Design

### Two-pane layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ▼ Personal                                    Untitled todo                    │
│    ▼ Grocery list                             ────────────────────────────────│
│       ☐ Milk                                                                  │
│       ☐ Eggs                                  # Buy the good milk             │
│       ☐ Bread                                                                 │
│    ▶ Weekend chores                           - Whole, organic                │
│    ▼ Reading                                  - No lactose-free               │
│       ☐ Finish chapter 3                                                      │
│                                               [urgent] [shopping]             │
│ ▼ Work                                                                        │
│    ▼ Q3 roadmap                                                              │
│       ☑ Draft outline    (done, dim)                                          │
│       ☐ Review with team                                                      │
│                                                                               │
│ + New root                                                                    │
├───────────────────────────────────────────────────────────────────────────────┤
│ Filter: [Tag ▾] [☐ Show done]      Search: [           ]                     │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Left pane (tree)

Powered by `react-arborist`. Row template:

- Chevron (open/close).
- Checkbox (toggle `done`; empty-vs-checked visual, done state dims the row).
- Title (single-line inline editor: click title → edit; Enter → save; Esc → cancel).
- Right-align: "has content" icon (small doc glyph), tag chips (max 3 visible; overflow → `+N` on hover), then due-date chip (`dueStatus(now, dueAt, done)` — see [Due Date](#due-date)).
- Row hover: 3-dot menu → `Add child`, `Add sibling`, `Duplicate`, `Delete…`. `Delete…` opens a confirm dialog whose body is required to state the subtree count (`Delete "X" and its N descendants?` when `N > 0`, `Delete "X"?` when `N == 0`). v1 does not implement undo — cascade + confirm is the whole affordance.

Interactions:

| Gesture | Effect |
|---|---|
| Click row | Select → right pane renders content |
| Double-click title | Enter inline edit mode |
| Enter | Save inline edit / new todo below (à la Notion) |
| Tab / Shift-Tab | Nest under previous sibling / promote to parent's sibling (both save immediately) |
| Backspace on empty title | Cancel inline edit for a brand-new row (which the user has not yet named). Never deletes an existing row. Deletion goes through the menu → confirm dialog. |
| Drag & drop | Reorder within siblings, or drop **onto** a row to nest inside |
| Arrow up/down | Navigate; wraps within siblings |
| Space | Toggle `done` |
| `/` | Focus filter search input |

### Right pane (detail)

- Selection follows tree; empty state when no selection.
- Two states: **View** (react-markdown, same renderer as Ideas) and **Edit** (textarea; save on blur; Cmd+S to force-save). Toggle via button; auto-switches to Edit on double-click of the render area.
- Tag row above the content: chips using `todoTagColor()`; the last chip is a `+ Add tag` input that autocompletes against the user's existing todo tags. Enter creates the tag if absent.
- **Due row** above the tag row: shows the due chip in large form + a calendar date picker; a "Clear" button removes the due date (see [Due Date](#due-date) for input/output semantics). v1 does not expose a time-of-day input.
- Metadata footer: created / updated timestamps, "Move to…" button (opens a searchable target-parent picker for keyboard flows).

### Global Search (Cmd+K)

Extend `SearchCommandDialog` with a "Todos" group after "Ideas". Match on `title` + `excerpt` (plain text, same rule as Ideas). Selection routes to `/dashboard/todos?id={id}` — the tree opens with that node selected and its ancestors expanded.

### Sidebar counter (v2)

The sidebar row can show a small counter of "open todos" (i.e., `WHERE done = 0`). Deferred to v2 to keep the first cut small.

---

## Server Actions

Add `actions/todos.ts` mirroring `actions/ideas.ts` shape:

- `getTodos()` — for initial fetch.
- `createTodo(input)` — returns full `TodoTreeNode` for optimistic append.
- `updateTodo(id, patch)` — returns updated node (server truth after excerpt regeneration).
- `moveTodo(id, {parentId, position})` — returns the affected slice (moving node + both parents' new sibling orders) so the client can rebuild without a full refetch.
- `reorderSiblings(parentId, orderedIds)` — batch reorder helper for pure sibling shuffles.
- `deleteTodo(id)` — returns removed IDs (for optimistic subtree cull).

Each action mirrors the actual `actions/ideas.ts` shape (v1 修订，Reviewer 反馈 #2):

- Return type: `ActionResult<T> = { success: boolean; data?: T; error?: string }` — same shape already exported by `actions/ideas.ts:6-10`.
- Auth: `const ctx = await getAuthContext()` at the top; return `{ success: false, error: 'Unauthorized' }` when `ctx` is null. No `withScopedDb` — that helper does not exist in the codebase; the current pattern is `ctx.db.<method>()`.
- Validation: hand-written minimal checks (trim/length/enum) inline in the action, matching `actions/ideas.ts` (no Zod). Introducing Zod would be a separate cross-cutting decision; deliberately not in v1.
- Errors: bubble up as `error` strings; do not throw across the server-action boundary.

---

## API v1 (deferred to v2)

Not in v1 scope. When added, mirror `/api/v1/ideas` endpoints:

- `GET /api/v1/todos` — flat list, tree shape reconstructed client-side.
- `POST /api/v1/todos` — create.
- `GET /api/v1/todos/[id]` — detail.
- `PATCH /api/v1/todos/[id]` — update.
- `POST /api/v1/todos/[id]/move` — reparent + reorder (dedicated endpoint so move validation and reorder stay one guarded operation even when only one field changes).
- `DELETE /api/v1/todos/[id]` — cascade delete.

New scopes: `todos:read`, `todos:write`. Reviewer to confirm the same scope-hygiene story as ideas (tag resolution requires no cross-scope, unlike ideas' `tags:read` because todo tags are text-only).

## CLI (deferred to v2)

`zhe todo …` mirrors `zhe idea …` shape when API v1 lands. Not in v1.

---

## Implementation Plan

### Phase 1: Database + Backend

1. Migration `0021_add_todos.sql` (todos + todo_tags).
2. Drizzle schema entries + typescript types.
3. `lib/todo-tag-color.ts` (FNV-1a + `todoTagColor()` helper).
4. `lib/todo-due.ts` (`dueStatus()` chip formatter + tests — see [Due Date](#due-date)).
5. `lib/db/scoped/todos.ts` with write-time cycle/depth guard and two-phase `moveTodo` reconcile.
6. `actions/todos.ts` (server actions).

### Phase 2: Dashboard UI

7. Install `react-arborist` (single dep).
8. `viewmodels/useTodosViewModel.ts` + `viewmodels/todos/{useTodosMutations,useTodosFilters,useTodosDnd}.ts`.
9. `contexts/dashboard-service-parts/useTodosSlice.ts` — feeds todos into the shared dashboard context (so Global Search can see them).
10. `components/dashboard/todos-page.tsx` + `todos-page-parts/*` (tree shell wrapper, tree row, right-pane, tag input, due picker, filter bar).
11. `components/dashboard/todo-tag-chip.tsx` — the coloured chip primitive.
12. Sidebar nav item + Global Search integration.
13. `app/(dashboard)/dashboard/todos/page.tsx`.

### Phase 3: Tests

14. L1 unit tests: cycle guard, depth guard, cross-move race + parent-deleted-mid-move (write-time guard invariants), tag colour determinism, `dueStatus` formatter (all 7 states + DST + year-drop), excerpt generator wiring.
15. L1 component tests: tree keyboard flows, tag chip behaviour, done-state visuals, due chip end-to-end, delete-confirm dialog subtree count.
16. L2 integration for the guarded `moveTodo` two-phase write + cross-move race (server-action level via `tests/integration/todos.test.ts`). REST endpoint tests belong to the v2 API commit set; v1 does not expose `/api/v1/todos` so `tests/api/todos.*.test.ts` is out of scope here.

## Atomic Commits

| # | Commit | Files |
|---|---|---|
| C1 | `docs(todos): draft todo feature design` (v0) | this document |
| C2 | `docs(todos): revise design after v0 review` (v1, current) | this document (`docs/21-todos-feature.md`) |
| C3 | `feat(db): add todos and todo_tags tables with dueAt (migration 0021)` | `drizzle/migrations/0021_*.sql`, `lib/db/schema.ts` |
| C4 | `feat(lib): add todo-tag-color and todo-due helpers` | `lib/todo-tag-color.ts`, `lib/todo-due.ts` + tests |
| C5 | `feat(db): add ScopedDB todos with write-time cycle/depth guard on move` | `lib/db/scoped/todos.ts` + tests |
| C6 | `feat(actions): add todo CRUD + move server actions` | `actions/todos.ts` + tests |
| C7 | `chore(deps): add react-arborist` | `package.json`, `bun.lock` |
| C8 | `feat(viewmodel): add useTodosViewModel` | `viewmodels/todos/*`, `viewmodels/useTodosViewModel.ts` |
| C9 | `feat(context): add todos slice to DashboardServiceProvider` | `contexts/dashboard-service-parts/useTodosSlice.ts`, `contexts/dashboard-service.tsx` |
| C10 | `feat(ui): add TodoTagChip + TodoDueChip primitives` | `components/dashboard/todo-tag-chip.tsx`, `components/dashboard/todo-due-chip.tsx` + tests |
| C11 | `feat(ui): add /dashboard/todos two-pane tree page` | `app/(dashboard)/dashboard/todos/page.tsx`, `components/dashboard/todos-page.tsx`, `components/dashboard/todos-page-parts/*` (tree shell, tree row, right-pane, due picker, filter bar) |
| C12 | `feat(ui): add narrow-viewport responsive fallback` | `components/dashboard/todos-page-parts/*` (Sheet-based drawer for <1024px) |
| C13 | `feat(ui): add "待办" to sidebar` | `components/sidebar-parts/nav-config.ts` |
| C14 | `feat(ui): add todos to global search` | `components/search-command-dialog.tsx`, `components/search-command-dialog-parts/todo-result-item.tsx` |
| C15 | `test(ui): add L1 component tests for todos page` | `tests/components/todos/*` |
| C16 | `test(integration): add L2 tests for todo move guarded batch + cross-move race` | `tests/integration/todos.test.ts` (server-action harness) |

Each commit passes pre-commit (ESLint, Vitest unit, typecheck, gitleaks) and is reviewable in isolation.

---

## Quality Gates (6DQ)

| Layer | Scope | Gate |
|-------|-------|------|
| L1 | Unit tests: cycle guard (incl. cross-move race), tag colour, excerpt, tree ViewModel | pre-commit |
| L1 | Component tests: tree keyboard, drag callback, right-pane switch, tag input | pre-commit |
| L2 | Server-action invariants: create, guarded two-phase move + cross-move race, cascade delete | pre-push |
| L3 | Playwright: create root → add child → drag reorder → check → delete | on-demand |
| G1 | TypeScript + ESLint strict, react-arborist typing surface exercised | pre-commit |
| G2 | gitleaks + osv-scanner (react-arborist advisory scan) | pre-commit + pre-push |

---

## Design Decisions Summary

| Issue | Decision | Rationale |
|---|---|---|
| Tree storage | Adjacency list (self-ref `parentId`) | Simpler CRUD; D1 workload is small; recursive queries acceptable at this scale |
| Ordering | Dense `position: integer` per sibling group | Simple, deterministic, batches well; fractional-index only if reorder cost becomes an issue |
| Cycle & depth prevention | Write-time ancestry+depth check via `WITH RECURSIVE ... UPDATE ... WHERE NOT EXISTS(...) RETURNING id`; client-side preflight is advisory only | Preflight-only race was reachable (see v1.1 change log); write-time SQL guard evaluates against committed state so a jointly-cyclic pair of moves cannot both succeed |
| Depth cap | `MAX_TODO_DEPTH = 12` (backend enforced by the write-time guard; UI shows early inline warning at 10+) | Backend authoritative — UI hint is a nicety only |
| Tag storage | Per-todo free-form strings, no shared `tags` table | 哥 explicit ask; keeps namespaces clean |
| Tag colour | Client-side hash → HSL | Deterministic, no persistence, no schema churn on new tags |
| Due date | v1 date-only (`dueAt: timestamp \| null`; input → local EOD UTC); date-time picker + `duePrecision` column deferred to v2 | Mixing date-only and date-time in a single column with overdue heuristics is fragile across DST/user edits; "Due Date" as a product noun matches the calendar-day story |
| Move payload | Dedicated `moveTodo` action returning affected slice; write-time cycle guard via UPDATE + RECURSIVE CTE; batch of guarded UPDATEs (D1 batch, not SQL transaction) | Move is the only path that could race into corruption; write-time guard is the only correct answer given D1 has no JS-visible transaction |
| Delete semantics | Cascade + confirm dialog stating subtree count; **no undo in v1** | Undo requires either soft-delete or subtree snapshot; both add scope; confirm-with-count is the guardrail |
| Done semantics | `done` boolean + `doneAt` timestamp; stays visible | Users often reference recently-done tasks; auto-archive is destructive |
| Move `updatedAt` scope | Touch moving row + old parent + new parent only (skip `null` parents; dedupe when old == new); **not the whole subtree** | Reviewer-locked; keeps the "recently modified" list from being contaminated by structural moves of ancestors |
| Tree control | `react-arborist` (v1); `@headless-tree/react` (fallback) | Every requested feature is first-class API; controlled mode is a clean fit |
| Row rendering ownership | We fully own the row template (`todos-page-parts/todo-row.tsx`) and the tree shell wrapper (`todos-page-parts/todo-tree.tsx`); arborist just orchestrates | Splits keep interactions localised and reviewable per commit |
| Content edit | Right-pane textarea in v1; live Markdown preview in v2 | Match Ideas' modal parity for launch; upgrade path clear |
| Narrow viewport | v1 ships a responsive fallback: `<1024px` shows tree full-width and moves detail into a slide-over `Sheet` component; drag-nesting is disabled on touch pointers, all other affordances (add / edit / check / delete / tag / due) work | Reviewer-locked: no desktop-only v1 |
| Server action shape | Mirror `actions/ideas.ts` exactly: `getAuthContext()`, `ActionResult<T>`, hand-written validation; no `withScopedDb` (does not exist) and no Zod (would be a separate cross-cutting decision) | Match reality; avoid inventing new patterns silently |
| API/CLI | Deferred to v2 | v1 ships the dashboard surface only; API/CLI is a mechanical port of ideas patterns |
| L2 test location | `tests/integration/todos.test.ts` (server-action harness); REST-level `tests/api/todos.*.test.ts` deferred to v2 with the endpoints themselves | Cannot ship API tests before the API |

---

## Out of Scope (v2 or later)

- REST API (`/api/v1/todos`) and CLI (`zhe todo …`)
- Live Markdown preview while editing in the right pane
- Multi-tag AND filter (Ideas doesn't have it either)
- Todo templates / prefill
- Recurring / scheduled todos
- Reminders / notifications (the underlying `dueAt` field is v1 but reminder delivery is v2)
- Sort tree by due date (nulls last)
- Todo assignment / sharing between users
- Sidebar open-todo counter badge
- Undo for delete (would require soft-delete column or snapshot preservation)
- Import from other todo apps

---

## Change Log

### v1.2 → v1.3 (2026-07-10 round-4)

Reviewer round-4 blocker + cosmetic residue merged:

- **Phase 2/3 crash gap eliminated with safe-tail position**: v1.2 wrote the moving row's `position = :newPosition` in Phase 2 and then compacted siblings in Phase 3. A crash between the two phases could leave the target parent with two rows at the same `position` (duplicate) and the old parent with a hole (violates dense ordering). v1.3 changes Phase 2 to write `position = COALESCE(MAX(position) FROM target siblings, -1) + 1` — the "safe tail" position that is guaranteed to be unique among the target parent's current children. Phase 3 then moves the row from its tail slot to `:newPosition` via a `UPDATE ... WHERE position = :tailPositionFromPhase2` (self-guarded), while opening the target slot and closing the old-parent hole. Crash-between-phases outcome is now documented honestly: target parent stays dense (moving row at tail), old parent has a one-slot gap, no duplicate positions anywhere, no cycles, no depth violations; next move on either parent re-establishes density. `getTodos()` sorts by `ORDER BY position` so gaps are visually irrelevant.
- **Vocabulary residue cleanup**: fixed the last stragglers — the API v2 move endpoint description said "action stays atomic", the Phase 1 ScopedDB table said "atomic `moveTodo`", the L2 QG row said "create/move/delete atomicity", the Phase 3 tests list said "`moveTodo` transaction". All rewritten as "guarded two-phase move" / "server-action invariants" / "guarded operation".

### v1.1 → v1.2 (2026-07-10 round-3)

Reviewer round-3 blockers merged:

- **Move contract split into explicit two-phase write**: v1.1 said "step 3/4/5 SHOULD go into a single `executeD1Batch` … application code inspects RETURNING after batch resolves … harmless drift". That was wrong — on a conflicted move it would leave sibling positions and parent `updatedAt` drifted with no user action. v1.2 splits [Move (contract)](#move-contract) into four phases: Phase 0 client preflight (advisory), Phase 1 server preflight `SELECT` (also computes moving-subtree height), Phase 2 guarded parent UPDATE via `executeD1Query` — **on empty RETURNING, no reconcile writes happen**, Phase 3 reconcile batch (sibling compact + parent `updatedAt`), Phase 4 affected-slice select. Document explicitly notes phases 2+3 are not one SQL transaction; a crash between them leaves a self-consistent state.
- **Depth cap considers moving-subtree height**: v1.1 guard checked only `newParent`'s own depth. A tall moving subtree could push descendants past `MAX_TODO_DEPTH`. v1.2 adds a `:movingSubtreeHeight` parameter (computed by Phase 1's descendant recursive CTE) and updates the write-time guard to reject when `newParentDepth + 1 + movingSubtreeHeight > MAX_TODO_DEPTH`. Test set gains "moving-subtree height overflow" regression.
- **Vocabulary sweep across the doc**: cleaned the last residual "single database transaction" (Design Principles), "inside a transaction" (ScopedDB table), "moveTodo transaction" (Quality Gates was already fixed), "inline date/time picker" (Right pane detail), and the `dueAt < now()` / "time is optional at input layer" wording under Data Model. Change Log v0→v1 entry now flags the incorrect race-tolerance argument as superseded so no reader treats it as authoritative.

### v1 → v1.1 (2026-07-10 round-2)

Reviewer round-2 blockers merged:

- **Move contract — write-time guard, not preflight-only**: v1's "preflight recursive CTE → application check → guarded batch" was reachably racy (two moves preflight against the old tree, both write, both succeed, ancestry ends up cyclic). v1.1 rewrites the moving row's parent-update as `WITH RECURSIVE ancestors AS (...) UPDATE ... WHERE NOT EXISTS(... movingId ...) AND (SELECT MAX(depth) FROM ancestors) < :maxDepth RETURNING id`, so the cycle/depth/ownership predicate evaluates against **committed database state at write time**. Empty `RETURNING` → application returns `Move conflicted or invalid` and the client refetches. Preflight is kept as an **advisory** client-side quick-reject. Test set explicitly covers cross-move race, parent-deleted-mid-move, depth-cap race, cross-user, happy path. Vocabulary swept: no more "atomic move" / "move transaction" / "inside a transaction" — replaced with "guarded batch + write-time ancestry guard".
- **Due date — v1 date-only only**: v1's mixed date-only + date-time in one column produced inconsistent overdue behaviour (a specific 09:00 time still showed `Today` at 10:00). v1.1 simplifies v1 to **date-only** (input → local EOD UTC, one clean overdue rule). date-time + `duePrecision` column moves to v2 with a documented migration path (all v1 rows migrate as `precision='date'`).
- **Doc hygiene**: Quality Gates, atomic commit C5/C16 titles, and the L1/L2 test lists all now read "write-time guard" / "guarded batch" instead of "atomic move".

### v0 → v1 (2026-07-10)

Merged 哥 追加需求 + Reviewer round-1 blockers:

- **New requirement — Due date**: added `dueAt: timestamp | null`, entire [Due Date](#due-date) section, tree-row chip + right-pane picker, chip formatter contract + tests.
- **Reviewer #1 due-date coverage**: locked input semantics (date-only → local end-of-day UTC), display rules for `overdue/today/tomorrow/soon/later/done-with-due/no-due`, filter facet, sort deferral to v2.
- **Reviewer #2 server-action pattern**: rewrote the [Server Actions](#server-actions) section to match `actions/ideas.ts` reality (`getAuthContext()` + `ActionResult<T>` + hand-written validation); removed the `withScopedDb` / colocated Zod claims.
- **Reviewer #3 move contract**: replaced "cycle checks inside transaction" with a preflight-CTE-read + application-check + guarded batch model, plus a race-tolerance argument, plus the invariant test coverage requirement. **⚠️ Superseded by v1.1 → the race-tolerance argument was wrong; see the v1 → v1.1 change log entry above and [Move (contract)](#move-contract) for the authoritative model.**
- **Reviewer #4 delete + undo conflict**: removed the "Backspace → delete with 3s undo toast" affordance. v1 delete is menu → confirm dialog (with subtree count) only; no undo. Rewrote the Backspace row to describe the "cancel unnamed row" case it actually handles.
- **Reviewer #5 test paths**: v1 L2 test target is `tests/integration/todos.test.ts` via server-action harness. `tests/api/todos.*.test.ts` (REST-level) deferred to v2 alongside the REST endpoints themselves. C14 renamed accordingly.
- **Open questions closed** (each moved into [Design Decisions](#design-decisions-summary)):
  1. Delete = cascade + confirm dialog with subtree count. No v1 undo.
  2. `updatedAt` on move touches moving row + old parent + new parent only; skip `null`; dedupe when equal.
  3. Depth cap `MAX_TODO_DEPTH = 12`; backend enforced; UI shows early inline warning at 10+.
  4. react-arborist styling: v1 owns row template + tree shell; arborist orchestrates only.
  5. Narrow viewport (<1024px): responsive fallback (tree full-width + detail in a `Sheet`); drag-nesting disabled on touch pointers. **No desktop-only v1.**

---

## Related Documents

- [Ideas Feature](19-ideas-feature.md) — the sibling module this design mirrors
- [Database Design](04-database.md)
- [Architecture](01-architecture.md)
- [Frontend Design Review](20-frontend-design-review.md)
