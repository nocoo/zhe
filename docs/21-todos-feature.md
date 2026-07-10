# TODO Feature

> **Status**: Design (v0). Not yet implemented.

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
6. **Atomic tree mutations**: Parent change, reorder, and rename land as a single database transaction so the client never observes torn state.
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
}));
```

Key choices:

- **Self-referential `parentId`** (adjacency list). Chosen over closure table / nested-set for CRUD simplicity; D1 workloads here are ≪ 10k rows per user, so the recursive-query cost is negligible.
- **`position: integer`** — dense integer ordering within `(userId, parentId)`. Reorders rewrite affected siblings' positions in a single batch; this is simpler than the fractional-index approach and D1's `executeD1Batch` handles the batch atomically. Client-side "optimistic" reordering can use fractional index locally for the drag preview then reconcile after the server response.
- **`done` + `doneAt`** — `doneAt` records when the flag flipped to `true`, cleared when it flips back. Enables "recently completed" and "completed this week" queries later without a separate history table.
- **Cascade delete on parent**: deleting a parent hides the subtree in one operation. Reviewer should ratify this vs. "orphan children up to root"; my recommendation is cascade + explicit user confirm at UI level (see [UI Design](#ui-design)).
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
2. Walk `parentId → parent.parentId → …` and reject if `id` appears in the ancestry chain.
3. Reject depth > `MAX_TODO_DEPTH = 12` (12 levels is more than enough for a task tree; a hard cap prevents accidental unbounded UI).

Cycle checks run **inside the transaction** so concurrent moves cannot together create a cycle.

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

`hasContent` on the tree node lets the tree row render a "has notes" glyph without pulling the full Markdown for every visible row.

---

## ScopedDB Methods

Add to `lib/db/scoped/todos.ts` (mirrors `lib/db/scoped/ideas.ts` layout).

| Method | Description |
|--------|-------------|
| `getTodos()` | Fetch **all** todos for the user in tree shape (single query, sorted `(parentId, position)`; client assembles the forest). |
| `getTodoById(id)` | Fetch a single todo detail with `content` + tags. |
| `createTodo({title, parentId?, content?, tagNames?})` | Insert todo at end of siblings, atomic tag insert. Cycle & depth pre-check. |
| `updateTodo(id, {title?, content?, done?, tagNames?})` | Content / metadata edits. Tags replace-all when provided. Touch `updatedAt`. Toggle `doneAt` on `done` change. |
| `moveTodo(id, {parentId, position})` | Reparent + reorder. Runs cycle+depth guard, rewrites affected siblings' positions inside a transaction. |
| `reorderSiblings(parentId, orderedIds[])` | Batch reorder within a single parent (used by DnD when only reordering, not reparenting). |
| `deleteTodo(id)` | Cascade delete via FK. Returns the count of removed rows. |

### Atomic move (contract)

`moveTodo` is the highest-risk operation. Contract:

- **Pre-check**: cycle + depth + parent-ownership (parent belongs to same user or is `null`).
- **Transaction**:
  1. Update `todos.parentId = newParent`, `todos.position = tempPosition = -1` for the moving row (avoid conflict with an existing row at the target index during the compact phase).
  2. Compact the source-parent's siblings' positions (fill the hole left by the move).
  3. Compact / open the target-parent's siblings' positions (make room at `newPosition`).
  4. Set the moving row's `position = newPosition`.
  5. Touch `updatedAt` on the moving row + both parents (`null` parent is skipped).

Reviewer: ratify whether "touch updatedAt on parents" is the right semantic — it lets the tree sort "recently touched subtree" without extra fields but couples move signals to unrelated content edits. My call: yes, keep it — the user-visible "recently modified" list should include structural moves.

### Excerpt generation

Reuse existing `stripMarkdown()` from `lib/markdown.ts` (added for Ideas). Same 200-char plaintext excerpt rule.

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
- Right-align: "has content" icon (small doc glyph), tag chips (max 3 visible; overflow → `+N` on hover).
- Row hover: 3-dot menu → `Add child`, `Add sibling`, `Duplicate`, `Delete…`.

Interactions:

| Gesture | Effect |
|---|---|
| Click row | Select → right pane renders content |
| Double-click title | Enter inline edit mode |
| Enter | Save inline edit / new todo below (à la Notion) |
| Tab / Shift-Tab | Nest under previous sibling / promote to parent's sibling (both save immediately) |
| Backspace on empty title | Delete row (with 3s undo toast) |
| Drag & drop | Reorder within siblings, or drop **onto** a row to nest inside |
| Arrow up/down | Navigate; wraps within siblings |
| Space | Toggle `done` |
| `/` | Focus filter search input |

### Right pane (detail)

- Selection follows tree; empty state when no selection.
- Two states: **View** (react-markdown, same renderer as Ideas) and **Edit** (textarea; save on blur; Cmd+S to force-save). Toggle via button; auto-switches to Edit on double-click of the render area.
- Tag row above the content: chips using `todoTagColor()`; the last chip is a `+ Add tag` input that autocompletes against the user's existing todo tags. Enter creates the tag if absent.
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

Each action wraps `withScopedDb` (same pattern as ideas) and validates input with Zod schemas colocated in `actions/todos-schemas.ts`.

---

## API v1 (deferred to v2)

Not in v1 scope. When added, mirror `/api/v1/ideas` endpoints:

- `GET /api/v1/todos` — flat list, tree shape reconstructed client-side.
- `POST /api/v1/todos` — create.
- `GET /api/v1/todos/[id]` — detail.
- `PATCH /api/v1/todos/[id]` — update.
- `POST /api/v1/todos/[id]/move` — reparent + reorder (dedicated endpoint so the action stays atomic even when only one field changes).
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
4. `lib/db/scoped/todos.ts` with cycle/depth guards and atomic `moveTodo`.
5. `actions/todos.ts` (server actions).

### Phase 2: Dashboard UI

6. Install `react-arborist` (single dep).
7. `viewmodels/useTodosViewModel.ts` + `viewmodels/todos/{useTodosMutations,useTodosFilters,useTodosDnd}.ts`.
8. `contexts/dashboard-service-parts/useTodosSlice.ts` — feeds todos into the shared dashboard context (so Global Search can see them).
9. `components/dashboard/todos-page.tsx` + `todos-page-parts/*` (tree row, right-pane, tag input, filter bar).
10. `components/dashboard/todo-tag-chip.tsx` — the coloured chip primitive.
11. Sidebar nav item + Global Search integration.
12. `app/(dashboard)/dashboard/todos/page.tsx`.

### Phase 3: Tests

13. L1 unit tests: cycle guard, depth guard, move transaction, tag colour determinism, excerpt generator wiring.
14. L1 component tests: tree keyboard flows, tag chip behaviour, done-state visuals.
15. L2 E2E for `POST /todos` and `POST /todos/[id]/move` (via server actions — v1 does not yet expose REST).

## Atomic Commits

| # | Commit | Files |
|---|---|---|
| C1 | `docs(todos): draft todo feature design` | this document |
| C2 | `feat(db): add todos and todo_tags tables (migration 0021)` | `drizzle/migrations/0021_*.sql`, `lib/db/schema.ts` |
| C3 | `feat(lib): add todo-tag-color helper` | `lib/todo-tag-color.ts` + test |
| C4 | `feat(db): add ScopedDB todos with cycle/depth guards and atomic move` | `lib/db/scoped/todos.ts` + tests |
| C5 | `feat(actions): add todo CRUD + move server actions` | `actions/todos.ts` + tests |
| C6 | `chore(deps): add react-arborist` | `package.json`, `bun.lock` |
| C7 | `feat(viewmodel): add useTodosViewModel` | `viewmodels/todos/*`, `viewmodels/useTodosViewModel.ts` |
| C8 | `feat(context): add todos slice to DashboardServiceProvider` | `contexts/dashboard-service-parts/useTodosSlice.ts`, `contexts/dashboard-service.tsx` |
| C9 | `feat(ui): add TodoTagChip primitive` | `components/dashboard/todo-tag-chip.tsx` + test |
| C10 | `feat(ui): add /dashboard/todos two-pane tree page` | `app/(dashboard)/dashboard/todos/page.tsx`, `components/dashboard/todos-page.tsx`, `components/dashboard/todos-page-parts/*` |
| C11 | `feat(ui): add "待办" to sidebar` | `components/sidebar-parts/nav-config.ts` |
| C12 | `feat(ui): add todos to global search` | `components/search-command-dialog.tsx`, `components/search-command-dialog-parts/todo-result-item.tsx` |
| C13 | `test(ui): add L1 component tests for todos page` | `tests/components/todos/*` |
| C14 | `test(e2e): add L2 tests for todo move transaction` | `tests/api/todos.*.test.ts` (using server-action harness) |

Each commit passes pre-commit (ESLint, Vitest unit, typecheck, gitleaks) and is reviewable in isolation.

---

## Quality Gates (6DQ)

| Layer | Scope | Gate |
|-------|-------|------|
| L1 | Unit tests: cycle guard, atomic move, tag colour, excerpt, tree ViewModel | pre-commit |
| L1 | Component tests: tree keyboard, drag callback, right-pane switch, tag input | pre-commit |
| L2 | Server-action E2E: create/move/delete atomicity | pre-push |
| L3 | Playwright: create root → add child → drag reorder → check → delete | on-demand |
| G1 | TypeScript + ESLint strict, react-arborist typing surface exercised | pre-commit |
| G2 | gitleaks + osv-scanner (react-arborist advisory scan) | pre-commit + pre-push |

---

## Design Decisions Summary

| Issue | Decision | Rationale |
|---|---|---|
| Tree storage | Adjacency list (self-ref `parentId`) | Simpler CRUD; D1 workload is small; recursive queries acceptable at this scale |
| Ordering | Dense `position: integer` per sibling group | Simple, deterministic, batches well; fractional-index only if reorder cost becomes an issue |
| Cycle prevention | Server pre-check inside transaction | Client can validate too, but server is the authority |
| Depth cap | `MAX_TODO_DEPTH = 12` | Guardrail against pathological UIs; user unlikely to hit organically |
| Tag storage | Per-todo free-form strings, no shared `tags` table | 哥 explicit ask; keeps namespaces clean |
| Tag colour | Client-side hash → HSL | Deterministic, no persistence, no schema churn on new tags |
| Delete semantics | Cascade + UI confirm | Deletion of a parent removes the subtree; explicit confirmation guards against typos |
| Done semantics | `done` boolean + `doneAt` timestamp; stays visible | Users often reference recently-done tasks; auto-archive is destructive |
| Move payload | Dedicated endpoint returning affected slice | Move is unique in that it touches ordering — no other CRUD needs the same shape |
| Tree control | `react-arborist` (v1); `@headless-tree/react` (fallback) | Every requested feature is first-class API; controlled mode is a clean fit |
| Content edit | Right-pane textarea in v1; live Markdown preview in v2 | Match Ideas' modal parity for launch; upgrade path clear |
| API/CLI | Deferred to v2 | v1 ships the dashboard surface only; API/CLI is a mechanical port of ideas patterns |

---

## Out of Scope (v2 or later)

- REST API (`/api/v1/todos`) and CLI (`zhe todo …`)
- Live Markdown preview while editing in the right pane
- Multi-tag AND filter (Ideas doesn't have it either)
- Todo templates / prefill
- Recurring / scheduled todos
- Due dates & reminders
- Todo assignment / sharing between users
- Sidebar open-todo counter badge
- Import from other todo apps

---

## Open Questions (for Reviewer)

1. **Cascade delete vs. reparent-to-root on delete parent** — my recommendation is cascade with UI confirm. Reviewer preference?
2. **`updatedAt` on structural moves** — should moving a subtree touch every affected row's `updatedAt`, or only the moving row and both parents? My call is "moving row + both parents".
3. **Depth cap value** — 12 is arbitrary. Any product reason to raise / lower?
4. **`react-arborist` styling ownership** — the library ships an unstyled skeleton but has strong DOM expectations. We must own the row template, which lives in `components/dashboard/todos-page-parts/todo-row.tsx`. Any preference on splitting further?
5. **Two-pane vs. modal** — the two-pane layout is the哥 explicit ask, but on narrow viewports (<1024px) it will collapse to a single pane with a drawer. Do we build the drawer in v1 or ship desktop-only for v1?

---

## Related Documents

- [Ideas Feature](19-ideas-feature.md) — the sibling module this design mirrors
- [Database Design](04-database.md)
- [Architecture](01-architecture.md)
- [Frontend Design Review](20-frontend-design-review.md)
