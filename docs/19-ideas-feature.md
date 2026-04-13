# Ideas Feature

> **Status**: Implementation in progress. Steps 1-13 completed.

---

## Overview

Ideas is a new feature for storing and organizing thoughts in Markdown format. Unlike links, ideas are full Markdown documents designed for capturing fleeting thoughts, notes, and inspirations.

```
┌─────────────────────────────────────────────────────────────────┐
│                          Ideas                                   │
├─────────────────────────────────────────────────────────────────┤
│  Core Features:                                                  │
│  • Markdown content storage                                      │
│  • Tag-based organization (no folders)                          │
│  • Grid / List view toggle                                       │
│  • CLI quick-add support                                         │
├─────────────────────────────────────────────────────────────────┤
│  Entry Points:                                                   │
│  • Dashboard: /dashboard/ideas                                   │
│  • CLI: zhe idea "content" or zhe idea add                      │
│  • API: POST /api/v1/ideas                                       │
│  • Global Search: Cmd+K (title + excerpt only)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

1. **Time-centric**: Every idea is anchored by its creation time — it's the primary identifier when no title is provided
2. **Minimal friction**: One-click or one-command to capture a thought
3. **Tag-only organization**: No folders, no categories — just tags for flexible filtering
4. **Markdown-first**: Full Markdown support for rich content
5. **Layout flexibility**: Grid view for visual scanning, list view for dense reading
6. **Atomic operations**: Tag binding is part of the create/update transaction, not fire-and-forget

---

## Data Model

### Ideas Table

```sql
CREATE TABLE ideas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,                 -- Optional, display time if null
  content    TEXT    NOT NULL,     -- Markdown content
  excerpt    TEXT,                 -- First 200 chars, plain text (for list/search)
  created_at INTEGER NOT NULL,     -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL      -- Unix timestamp (ms), updated on content/title/tag changes
);

CREATE INDEX idx_ideas_user_id ON ideas(user_id);
CREATE INDEX idx_ideas_created_at ON ideas(user_id, created_at DESC);
CREATE INDEX idx_ideas_updated_at ON ideas(user_id, updated_at DESC);
```

### Idea Tags Table (Many-to-Many)

Reuse the existing `tags` table, add a new join table:

```sql
CREATE TABLE idea_tags (
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  tag_id  TEXT    NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (idea_id, tag_id)
);
```

### Key Design Decisions

#### Excerpt Field

The `excerpt` field stores the first 200 characters of content as **plain text** (Markdown stripped). This enables:
- Fast list rendering without loading full content
- Efficient search without full-text scanning
- Reduced memory footprint in dashboard context

**Generation**: Server-side on create/update, using a simple Markdown-to-plaintext transform.

#### updated_at Semantics

`updated_at` is refreshed when **any** of the following change:
- `title`
- `content`
- Tag associations (add or remove)

This ensures "recently modified" sorting reflects all meaningful edits.

### Title Display Strategy

When `title` is `NULL`:

1. **Display format**: Show creation time as title (e.g., "Apr 13, 14:32")
2. **Future enhancement**: Auto-generate title from first line or AI summary (out of scope for v1)

---

## ScopedDB Methods

Add to `lib/db/scoped.ts`:

### Ideas

| Method | Description |
|--------|-------------|
| `getIdeas(options?)` | Get ideas with optional tag filter, ordered by `created_at DESC`. Returns list shape (no full content). |
| `getIdeaById(id)` | Get single idea by ID, including full content |
| `createIdea(data)` | Create idea with content, optional title, optional tagIds. **Atomic**: inserts idea + tags in single transaction. |
| `updateIdea(id, data)` | Update idea content, title, and/or tags. **Atomic**: updates idea + syncs tags in single transaction. Also updates `updated_at`. |
| `deleteIdea(id)` | Delete idea (cascade deletes `idea_tags`) |

### Data Shapes

```typescript
/** Lightweight shape for list views and search */
interface IdeaListItem {
  id: number;
  title: string | null;
  excerpt: string | null;  // First 200 chars, plain text
  tagIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Full shape for detail view / edit */
interface IdeaDetail extends IdeaListItem {
  content: string;  // Full Markdown
}
```

### Atomic Tag Binding

Unlike links (where tags are fire-and-forget), idea tags are bound atomically using `executeD1Batch()`:

```typescript
// createIdea implementation sketch — uses D1 batch for atomicity
async createIdea(data: { content: string; title?: string; tagIds?: string[] }): Promise<IdeaDetail> {
  const now = Date.now();
  const excerpt = stripMarkdown(data.content).slice(0, 200);
  
  // Step 1: Pre-validate tagIds belong to user (fail-fast before batch)
  if (data.tagIds?.length) {
    const validTags = await executeD1Query<{ id: string }>(
      `SELECT id FROM tags WHERE user_id = ? AND id IN (${data.tagIds.map(() => '?').join(',')})`,
      [this.userId, ...data.tagIds]
    );
    if (validTags.length !== data.tagIds.length) {
      const validIds = new Set(validTags.map(t => t.id));
      const invalid = data.tagIds.filter(id => !validIds.has(id));
      throw new Error(`Invalid tag IDs: ${invalid.join(', ')}`);
    }
  }
  
  // Step 2: Build batch statements
  const statements: D1Statement[] = [
    {
      sql: `INSERT INTO ideas (user_id, title, content, excerpt, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *`,
      params: [this.userId, data.title ?? null, data.content, excerpt, now, now],
    },
  ];
  
  // Add tag binding statements (tagIds already validated above)
  if (data.tagIds?.length) {
    for (const tagId of data.tagIds) {
      statements.push({
        sql: `INSERT INTO idea_tags (idea_id, tag_id)
              VALUES (last_insert_rowid(), ?)`,
        params: [tagId],
      });
    }
  }
  
  // Step 3: Single atomic batch — all succeed or all fail
  const results = await executeD1Batch<Record<string, unknown>>(statements);
  
  // First result is the idea INSERT RETURNING *
  const ideaRow = results[0]?.[0];
  if (!ideaRow) {
    throw new Error('Failed to create idea');
  }
  
  return { ...rowToIdea(ideaRow), tagIds: data.tagIds ?? [] };
}
```

**Key design points**:

1. **Pre-validation**: TagIds are validated **before** the batch. If any tagId doesn't exist or doesn't belong to the user, we fail immediately without touching the database.

2. **RETURNING \***: The INSERT uses `RETURNING *` so the batch result includes the created idea row.

3. **Batch atomicity**: If any INSERT fails (e.g., constraint violation), the entire batch rolls back. The pre-validation ensures tag INSERTs won't silently insert 0 rows.

**Test requirement**: L1 unit tests must include:
- Case 1: Create with invalid tagId → error returned, no idea created
- Case 2: Create with valid tagIds → idea and all tag associations created
- Case 3: Create with empty tagIds → idea created, no tag associations

---

## UI Design

### Sidebar Navigation

Add "Ideas" to the sidebar, in the "概览" group:

```typescript
// components/sidebar.tsx
const PRE_LINK_NAV_GROUPS: NavGroup[] = [
  {
    label: "概览",
    items: [
      { title: "概览", icon: BarChart3, href: "/dashboard/overview" },
      { title: "Ideas", icon: Lightbulb, href: "/dashboard/ideas" },  // NEW
    ],
  },
];
```

### Global Search (Cmd+K)

Add ideas to `SearchCommandDialog`:

- Search across `title` and `excerpt` (NOT full content — performance)
- Display in separate "Ideas" group below "Links"
- Click navigates to `/dashboard/ideas?id={id}` (opens detail modal)

**Data Source**: Extend `DashboardServiceProvider` to include `ideas: IdeaListItem[]` in the global state. This ensures ideas are available for Cmd+K search on **any** dashboard page, not just `/dashboard/ideas`.

```typescript
// contexts/dashboard-service.tsx changes
export interface DashboardState {
  links: Link[];
  folders: Folder[];
  tags: Tag[];
  linkTags: LinkTag[];
  ideas: IdeaListItem[];  // NEW: list shape only (id, title, excerpt, tagIds)
  loading: boolean;
  siteUrl: string;
}

// getDashboardData server action also fetches ideas
```

The provider fetches ideas alongside links/tags on mount. Since ideas use list shape (no `content`), memory footprint is controlled.

### Dashboard Page: `/dashboard/ideas`

#### Layout Toggle

- **Grid View** (default): Masonry-style cards, similar to `/dashboard/overview` click charts
- **List View**: Compact rows, similar to `/dashboard/uploads` table

#### Grid Card

```
┌─────────────────────────────┐
│ Apr 13, 14:32        [tag1] │  ← Time or title + tags
├─────────────────────────────┤
│ First 3-4 lines of         │
│ excerpt preview...          │
│ (plain text, not MD)        │
└─────────────────────────────┘
```

#### List Row

```
┌───────────────────────────────────────────────────────────────────┐
│ Apr 13, 14:32 │ Excerpt preview...                 │ [tag1] [tag2]│
└───────────────────────────────────────────────────────────────────┘
```

#### Actions

| Action | Description |
|--------|-------------|
| Add | Open modal/drawer for new idea |
| Edit | Open modal/drawer for editing (inline edit not suitable for Markdown) |
| Delete | Delete with confirmation |
| Copy | Copy full Markdown content |
| Tag | Add/remove tags (part of edit modal, not separate action) |

#### Filtering

- **Tag Filter**: Single-select dropdown (same as current links implementation)
- **Search**: Search across `title` + `excerpt` using LIKE (same pattern as links)

> **Note**: Multi-tag AND filtering is NOT implemented in v1. The current links implementation only supports single `tagId` filter. If multi-tag is needed, it should be added to both links and ideas in a future iteration.

### Add/Edit Modal

```
┌─────────────────────────────────────────────────────────────────────┐
│ New Idea                                                      [X]   │
├─────────────────────────────────────────────────────────────────────┤
│ Title (optional)                                                    │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │                                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Content *                                                           │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ # My Thought                                                    │ │
│ │                                                                 │ │
│ │ Some **markdown** content...                                    │ │
│ │                                                                 │ │
│ │                                                                 │ │
│ │                                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Tags                                                                │
│ [tag1 ×] [tag2 ×] [Select tag ▼]                                    │
│                                                                     │
│                                         [Cancel]  [Save]            │
└─────────────────────────────────────────────────────────────────────┘
```

**Tag Selection**: Dropdown selects from existing tags only. No inline tag creation — use `/dashboard` tag management if new tags needed. This keeps the contract simple: API/CLI/UI all accept tag IDs only.

---

## CLI Commands

### Tag Resolution

All CLI commands accept **tag names** (not IDs) for user convenience. The CLI resolves names to IDs via `GET /api/v1/tags`:

```bash
# User types tag name
zhe idea add --tag work --tag urgent

# CLI internally:
# 1. GET /api/v1/tags → find IDs for "work" and "urgent"
# 2. POST /api/v1/ideas with tagIds: ["id1", "id2"]
# 3. If tag name not found → error "Tag 'xxx' not found. Create it first."
```

No auto-creation of tags. This keeps behavior consistent across Web/CLI/API.

**Scope Requirement**: CLI tag resolution requires `tags:read` scope in addition to `ideas:*` scopes. When creating an API Key for CLI usage with idea tag support, include both `ideas:read`, `ideas:write`, and `tags:read`.

### `zhe idea <content>`

Quick-add an idea with content as argument:

```bash
# Quick add (content as argument)
zhe idea "My quick thought about something"

# Output: ✓ Created idea #42 (Apr 13, 14:32)

# With tags (resolved by name)
zhe idea "My thought" --tag work --tag urgent
```

### `zhe idea add`

Interactive mode for longer content:

```bash
zhe idea add [options]

Options:
  -t, --title <title>    Optional title
  --tag <name>           Add tag by name (repeatable)
  --json                 Output as JSON
```

Opens `$EDITOR` (or prompts for inline input) for Markdown content.

### `zhe idea list`

List all ideas (returns list shape, not full content):

```bash
zhe idea list [options]

Options:
  -l, --limit <n>        Max results (default: 20)
  --tag <name>           Filter by tag name
  --json                 Output as JSON
```

Output (default):

```
ID    TIME             TITLE                    TAGS
────────────────────────────────────────────────────────
42    Apr 13, 14:32    My quick thought...      [work] [urgent]
41    Apr 12, 09:15                             [personal]
40    Apr 11, 23:45    Meeting notes            [work]
```

### `zhe idea get <id>`

Get full idea content:

```bash
zhe idea get 42

# Output:
# ────────────────────────────
# Idea #42 — Apr 13, 14:32
# Tags: [work] [urgent]
# ────────────────────────────
#
# My quick thought about something
#
# More details here...
```

### `zhe idea update <id>`

Update idea:

```bash
zhe idea update <id> [options]

Options:
  -c, --content <text>   New content (or opens $EDITOR if omitted)
  -t, --title <title>    New title (use "" to clear)
  --tag <name>           Set tags (replaces all existing tags)
  --json                 Output as JSON
```

### `zhe idea delete <id>`

Delete idea:

```bash
zhe idea delete <id> [options]

Options:
  -y, --yes              Skip confirmation
  --json                 Output as JSON
```

---

## API v1 Endpoints

### Scope

New API scopes:
- `ideas:read` — List and get ideas
- `ideas:write` — Create, update, delete ideas

### Endpoints

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/ideas` | GET | `ideas:read` | List ideas (returns list shape) |
| `/api/v1/ideas` | POST | `ideas:write` | Create idea with atomic tag binding |
| `/api/v1/ideas/[id]` | GET | `ideas:read` | Get idea (returns detail shape with full content) |
| `/api/v1/ideas/[id]` | PATCH | `ideas:write` | Update idea with atomic tag sync |
| `/api/v1/ideas/[id]` | DELETE | `ideas:write` | Delete idea |

### Request/Response Examples

**POST /api/v1/ideas**

Request:
```json
{
  "content": "My **markdown** thought",
  "title": "Optional title",
  "tagIds": ["tag-uuid-1", "tag-uuid-2"]
}
```

> **Note**: `tagIds` accepts tag UUIDs only. CLI resolves tag names to IDs client-side.

Response (201):
```json
{
  "idea": {
    "id": 42,
    "title": "Optional title",
    "content": "My **markdown** thought",
    "excerpt": "My markdown thought",
    "tags": [
      { "id": "tag-uuid-1", "name": "work", "color": "#FF5733" }
    ],
    "createdAt": "2026-04-13T14:32:00.000Z",
    "updatedAt": "2026-04-13T14:32:00.000Z"
  }
}
```

**GET /api/v1/ideas** (List)

Query params:
- `limit` (number, 1-500, default: 100)
- `offset` (number, default: 0)
- `tagId` (string, single tag filter)
- `q` (string, search title + excerpt)

Response (list shape — no `content` field):
```json
{
  "ideas": [
    {
      "id": 42,
      "title": "Optional title",
      "excerpt": "My markdown thought",
      "tags": [...],
      "createdAt": "2026-04-13T14:32:00.000Z",
      "updatedAt": "2026-04-13T14:32:00.000Z"
    }
  ]
}
```

**GET /api/v1/ideas/[id]** (Detail)

Response (detail shape — includes `content`):
```json
{
  "idea": {
    "id": 42,
    "title": "Optional title",
    "content": "My **markdown** thought",
    "excerpt": "My markdown thought",
    "tags": [...],
    "createdAt": "2026-04-13T14:32:00.000Z",
    "updatedAt": "2026-04-13T14:32:00.000Z"
  }
}
```

**PATCH /api/v1/ideas/[id]**

Request (all fields optional):
```json
{
  "content": "Updated content",
  "title": "New title",
  "tagIds": ["tag-uuid-1"]
}
```

> **Note**: `tagIds` replaces all existing tags (not additive). Omit to keep existing tags.

---

## Implementation Plan

### Phase 1: Database + Backend

1. **Migration**: Add `ideas` and `idea_tags` tables (include `excerpt` column)
2. **Helpers**: Add `stripMarkdown()` utility for excerpt generation
3. **ScopedDB**: Add idea CRUD methods with atomic tag binding
4. **Server Actions**: `createIdea`, `updateIdea`, `deleteIdea` (tags included in payload, not separate actions)

### Phase 2: API v1

1. **Scopes**: Add `ideas:read`, `ideas:write` to API key system
2. **Routes**: Implement `/api/v1/ideas` endpoints with list/detail shape separation
3. **Tests**: L1 unit tests + L2 API E2E tests

### Phase 3: Dashboard UI

1. **Sidebar**: Add "Ideas" nav item to sidebar
2. **Page**: `/dashboard/ideas` with grid/list toggle
3. **Components**: `IdeaCard`, `IdeaRow`, `IdeaModal`
4. **ViewModel**: `useIdeasViewModel` following existing MVVM pattern (store list shape only)
5. **Global Search**: Add ideas to `SearchCommandDialog` (search title + excerpt)
6. **Tests**: L1 component tests

### Phase 4: CLI

1. **Command**: `zhe idea` with subcommands
2. **Tag Resolution**: Resolve tag names to IDs via API before create/update
3. **API Client**: Add idea methods to `cli/src/api/client.ts`
4. **Tests**: L1 unit tests

---

## Atomic Commits

| Step | Commit Message | Files Changed | Status |
|------|----------------|---------------|--------|
| 1 | `feat(db): add ideas and idea_tags tables` | `drizzle/migrations/0017_*.sql`, `lib/db/schema.ts` | ✅ |
| 2 | `feat(lib): add stripMarkdown utility` | `lib/markdown.ts` | ✅ |
| 3 | `feat(db): add ScopedDB methods for ideas with atomic tag binding` | `lib/db/scoped.ts`, `lib/db/mappers.ts` | ✅ |
| 4 | `feat(actions): add idea CRUD server actions` | `actions/ideas.ts` | ✅ |
| 5 | `feat(api): add ideas:read and ideas:write scopes` | `models/api-key.ts` | ✅ |
| 6 | `feat(api): add /api/v1/ideas endpoints with list/detail shapes` | `app/api/v1/ideas/*` | ✅ |
| 7 | `test(api): add L1 + L2 tests for ideas API` | `tests/unit/api/ideas.test.ts`, `tests/api/v1/ideas.test.ts` | ✅ |

> **Critical test cases for step 7** (atomic tag binding verification):
> 1. Create with invalid tagId → API returns 400, no idea row in database
> 2. Create with valid tagIds → idea created, all tag associations exist
> 3. Create with empty tagIds → idea created, no tag associations
| 8 | `feat(ui): add Ideas to sidebar navigation` | `components/sidebar.tsx` | ✅ |
| 9 | `feat(context): add ideas to DashboardServiceProvider` | `contexts/dashboard-service.tsx`, `actions/dashboard.ts` | ✅ |
| 10 | `feat(viewmodel): add useIdeasViewModel` | `viewmodels/use-ideas-viewmodel.ts` | ✅ |
| 11 | `feat(ui): add IdeaCard and IdeaRow components` | `components/dashboard/ideas/*` | ✅ |
| 12 | `feat(ui): add /dashboard/ideas page` | `app/(dashboard)/dashboard/ideas/page.tsx` | ✅ |
| 13 | `feat(ui): add ideas to global search` | `components/search-command-dialog.tsx` | ✅ |
| 14 | `test(ui): add L1 component tests for ideas` | `tests/components/ideas.test.tsx` | ⏳ |
| 15 | `feat(cli): add zhe idea command with tag name resolution` | `cli/src/commands/idea.ts`, `cli/src/index.ts` | ⏳ |
| 16 | `test(cli): add tests for idea command` | `cli/tests/commands/idea.test.ts` | ⏳ |

---

## Quality Gates (6DQ)

| Layer | Scope | Gate |
|-------|-------|------|
| L1 | Unit tests for ScopedDB, Server Actions, Components, CLI | pre-commit |
| L2 | API E2E tests for `/api/v1/ideas` | pre-push |
| L3 | Playwright E2E for `/dashboard/ideas` | on-demand |
| G1 | TypeScript + ESLint strict | pre-commit |
| G2 | gitleaks + osv-scanner | pre-commit + pre-push |

---

## Design Decisions Summary

| Issue | Decision | Rationale |
|-------|----------|-----------|
| Tag binding atomicity | Atomic (single transaction) | Ideas rely on tags as primary organization; partial state is unacceptable |
| List vs detail shape | Separate shapes | List excludes `content`, only returns `excerpt`; prevents memory bloat |
| Tag input format | Tag IDs only (API), tag names (CLI resolved client-side) | Single contract; CLI handles name→ID resolution; requires `tags:read` |
| Multi-tag AND filter | Not in v1 | Current links implementation doesn't support it either; add later to both |
| Search scope | Title + excerpt only | FTS5 out of scope; LIKE on excerpt is fast enough |
| updated_at semantics | Updated on title, content, or tag change | Ensures "recently modified" sort is meaningful |
| Route path | `app/(dashboard)/dashboard/ideas/page.tsx` | Matches existing pattern for `/dashboard/*` routes |

---

## Out of Scope (Future)

- [ ] AI-generated title/summary
- [ ] Full-text search index (FTS5) for content
- [ ] Markdown preview in modal (live preview while editing)
- [ ] Image embedding in content
- [ ] Idea templates
- [ ] Public sharing (like links)
- [ ] Keyboard shortcuts (Cmd+N for new idea)
- [ ] Multi-tag AND filtering (requires changes to links too)
- [ ] Tag auto-creation from CLI/API

---

## Related Documents

- [Database Design](04-database.md)
- [CLI Design](18-cli-design.md)
- [Features](03-features.md)
- [Architecture](01-architecture.md)
