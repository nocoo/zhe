// @vitest-environment node
/**
 * L1 unit tests for `lib/db/scoped/todos.ts`.
 *
 * The suite runs against a real in-memory SQLite (`node:sqlite`, available
 * in Node 22+ / bun runs of vitest v4) rather than the string-matching
 * fixture in `tests/setup.ts` — the whole point of C5 is the write-time
 * cycle/depth guard in the recursive-CTE UPDATE, which the fixture cannot
 * exercise. To keep the suite hermetic we mock `@/lib/db/d1-client` so
 * `executeD1Query` / `executeD1Batch` are dispatched onto our fresh DB
 * instead of hitting the real Cloudflare Worker proxy.
 *
 * Coverage:
 *   • Read shapes — getTodos, getTodoById, getTodoTags.
 *   • Create — depth cap, missing parent, tag normalisation, position tail.
 *   • Update — tag replace-all, done/doneAt lockstep, dueAt round-trip.
 *   • Move (reparent) — happy path, self-parent reject, cycle guard,
 *     cross-user ownership guard, MAX_TODO_DEPTH guard against parent
 *     depth AND moving-subtree height, cross-move race, parent-deleted
 *     mid-move.
 *   • Move (same-parent) — routed to reorderWithinParent, no cycle SQL.
 *   • Delete — cascade.
 *   • reorderSiblings — stale-id rejection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

// A fresh in-memory DB per test; module-scoped so the vi.mock below can see
// it via a stable closure. `setupDb()` (called in beforeEach) reassigns the
// binding to a new Database instance.
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { all: (...args: unknown[]) => unknown[]; get: (...args: unknown[]) => unknown; run: (...args: unknown[]) => { changes: number; lastInsertRowid: number | bigint } };
  close(): void;
};
let db: SqliteDatabase;

// The mock must be at module top-level (vitest hoists) but the callbacks
// close over `db`, which is reassigned in beforeEach — that keeps every
// test on its own fresh schema without needing to reset the mock.
vi.mock('@/lib/db/d1-client', () => {
  const runQuery = <T>(sql: string, params: unknown[] = []): T[] => {
    const stmt = db.prepare(sql);
    const trimmed = sql.trim().toUpperCase();
    // Statements without result rows: run() rather than all().
    // SQLite DML with RETURNING still needs all()/get().
    const isMutation = /^(INSERT|UPDATE|DELETE)/.test(trimmed);
    const hasReturning = /RETURNING/i.test(sql);
    if (isMutation && !hasReturning) {
      stmt.run(...params);
      return [] as T[];
    }
    return stmt.all(...params) as T[];
  };

  return {
    isD1Configured: () => true,
    executeD1Query: async <T>(sql: string, params: unknown[] = []) => runQuery<T>(sql, params),
    executeD1Batch: async <T>(statements: Array<{ sql: string; params?: unknown[] }>) => {
      const out: T[][] = [];
      for (const stmt of statements) {
        out.push(runQuery<T>(stmt.sql, stmt.params ?? []));
      }
      return out;
    },
  };
});

import {
  MAX_TODO_DEPTH,
  TodoDepthExceededError,
  TodoMoveConflictError,
  TodoNotFoundError,
} from '@/lib/db/scoped/types';
import {
  createTodo,
  deleteTodo,
  getTodoById,
  getTodoTags,
  getTodos,
  moveTodo,
  reorderSiblings,
  updateTodo,
} from '@/lib/db/scoped/todos';

/** Full DDL for todos + todo_tags + a matching users table for the FK.
 *  Kept in the test file so a schema drift in production DDL is loud —
 *  the tests will fail rather than silently pass against stale columns. */
const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE users (id TEXT PRIMARY KEY);
  CREATE TABLE todos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id     INTEGER REFERENCES todos(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    title         TEXT    NOT NULL,
    content       TEXT,
    excerpt       TEXT,
    done          INTEGER NOT NULL DEFAULT 0,
    done_at       INTEGER,
    due_at        INTEGER,
    emoji         TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE TABLE todo_tags (
    todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (todo_id, name)
  );
  CREATE INDEX idx_todos_user_parent  ON todos(user_id, parent_id, position);
  CREATE INDEX idx_todos_user_updated ON todos(user_id, updated_at DESC);
  CREATE INDEX idx_todos_user_done    ON todos(user_id, done);
  CREATE INDEX idx_todos_user_due     ON todos(user_id, due_at);
`;

function setupDb(): void {
  db = new DatabaseSync(':memory:') as unknown as SqliteDatabase;
  db.exec(SCHEMA_SQL);
  db.prepare('INSERT INTO users(id) VALUES (?)').run('u1');
  db.prepare('INSERT INTO users(id) VALUES (?)').run('u2');
}

async function makeRoot(userId: string, title: string): Promise<number> {
  const detail = await createTodo(userId, { title });
  return detail.id;
}

async function makeChild(userId: string, parentId: number, title: string): Promise<number> {
  const detail = await createTodo(userId, { title, parentId });
  return detail.id;
}

async function makeChain(userId: string, length: number): Promise<number[]> {
  const ids: number[] = [];
  let parentId: number | null = null;
  for (let i = 0; i < length; i += 1) {
    const detail = await createTodo(userId, {
      title: `node-${i}`,
      parentId,
    });
    ids.push(detail.id);
    parentId = detail.id;
  }
  return ids;
}

/**
 * Fetch every todo for a user and return them keyed by id. Throws when a
 * caller-supplied id is missing so tests can chain into properties without
 * `!` non-null assertions (which the repo's ESLint config forbids).
 */
async function snapshot(userId: string): Promise<{
  all: import('@/lib/db/scoped').TodoTreeNode[];
  byId: (id: number) => import('@/lib/db/scoped').TodoTreeNode;
}> {
  const all = await getTodos(userId);
  const map = new Map(all.map((n) => [n.id, n]));
  return {
    all,
    byId(id: number) {
      const node = map.get(id);
      if (!node) throw new Error(`snapshot(${userId}): missing todo id=${id}`);
      return node;
    },
  };
}

function head<T>(list: readonly T[], label: string): T {
  const v = list[0];
  if (v === undefined) throw new Error(`head(${label}): empty list`);
  return v;
}

beforeEach(() => {
  setupDb();
});

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

describe('getTodos', () => {
  it('returns a flat list sorted by (parent_id, position) with tag names populated', async () => {
    const root = await makeRoot('u1', 'root');
    const a = await makeChild('u1', root, 'a');
    const b = await makeChild('u1', root, 'b');
    await updateTodo('u1', a, { tagNames: ['work', 'Urgent'] });
    await updateTodo('u1', b, { tagNames: ['home'] });

    const list = await getTodos('u1');
    // Root then children; both children in insert order at positions 0/1.
    expect(list.map((n) => [n.id, n.parentId, n.position])).toEqual([
      [root, null, 0],
      [a, root, 0],
      [b, root, 1],
    ]);
    expect(head(list.filter((n) => n.id === a), 'child a').tagNames).toEqual(['urgent', 'work']);
    expect(head(list.filter((n) => n.id === b), 'child b').tagNames).toEqual(['home']);
  });

  it('projects hasContent without shipping the full content payload', async () => {
    const rootWith = await createTodo('u1', {
      title: 'has content',
      content: '# body',
    });
    const rootWithout = await createTodo('u1', { title: 'no content' });
    const { byId } = await snapshot('u1');
    expect(byId(rootWith.id).hasContent).toBe(true);
    expect(byId(rootWithout.id).hasContent).toBe(false);
    // Tree nodes never carry content.
    expect(Object.hasOwn(byId(rootWith.id), 'content')).toBe(false);
  });

  it('carries excerpt on the tree shape so global search can hit note content', async () => {
    // Regression for C14: search dialog needs to match on title + excerpt,
    // so getTodos MUST project excerpt onto the lightweight TodoTreeNode.
    const created = await createTodo('u1', {
      title: 'read',
      content: '# Buy groceries\n\nmilk, eggs, bread',
    });
    const { byId } = await snapshot('u1');
    const node = byId(created.id);
    expect(node.excerpt).not.toBeNull();
    expect(node.excerpt?.toLowerCase()).toContain('groceries');
    // Empty-content todos still return null excerpt.
    const noContent = await createTodo('u1', { title: 'bare' });
    expect((await snapshot('u1')).byId(noContent.id).excerpt).toBeNull();
  });

  it('scopes strictly by userId — never returns another user\'s rows', async () => {
    await makeRoot('u1', 'mine');
    await makeRoot('u2', 'theirs');
    expect(await getTodos('u1')).toHaveLength(1);
    expect(await getTodos('u2')).toHaveLength(1);
  });
});

describe('getTodoById', () => {
  it('returns detail including content/excerpt/tagNames or null on miss', async () => {
    const created = await createTodo('u1', {
      title: 'note',
      content: '# hi\n\nbody',
      tagNames: ['Alpha'],
    });
    const got = await getTodoById('u1', created.id);
    expect(got?.content).toBe('# hi\n\nbody');
    expect(got?.excerpt).toContain('hi');
    expect(got?.tagNames).toEqual(['alpha']);
    expect(await getTodoById('u1', 9999)).toBeNull();
    // Cross-user access returns null even when the id exists elsewhere.
    expect(await getTodoById('u2', created.id)).toBeNull();
  });
});

describe('getTodoTags', () => {
  it('returns distinct canonical names in alpha order', async () => {
    const a = await makeRoot('u1', 'a');
    const b = await makeRoot('u1', 'b');
    await updateTodo('u1', a, { tagNames: ['Work', 'home'] });
    await updateTodo('u1', b, { tagNames: ['work', 'reading'] });
    expect(await getTodoTags('u1')).toEqual(['home', 'reading', 'work']);
  });
});

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

describe('createTodo', () => {
  it('rejects an empty title', async () => {
    await expect(createTodo('u1', { title: '   ' })).rejects.toThrow(
      /title cannot be empty/i,
    );
  });

  it('rejects a missing parent', async () => {
    await expect(
      createTodo('u1', { title: 'child', parentId: 999 }),
    ).rejects.toBeInstanceOf(TodoNotFoundError);
  });

  it('rejects when the resulting depth would exceed the cap', async () => {
    const chain = await makeChain('u1', MAX_TODO_DEPTH);
    const deepest = chain.at(-1);
    if (deepest === undefined) throw new Error('chain unexpectedly empty');
    await expect(
      createTodo('u1', { title: 'overflow', parentId: deepest }),
    ).rejects.toBeInstanceOf(TodoDepthExceededError);
  });

  it('assigns position at the tail of the target parent', async () => {
    const root = await makeRoot('u1', 'root');
    const c1 = await makeChild('u1', root, 'first');
    const c2 = await makeChild('u1', root, 'second');
    const c3 = await makeChild('u1', root, 'third');
    const positions = (await getTodos('u1'))
      .filter((n) => n.parentId === root)
      .map((n) => [n.id, n.position]);
    expect(positions).toEqual([
      [c1, 0],
      [c2, 1],
      [c3, 2],
    ]);
  });

  it('normalises tags on insert (trim + lowercase + dedupe)', async () => {
    const created = await createTodo('u1', {
      title: 't',
      tagNames: ['  Work ', 'work', 'HOME'],
    });
    // Retrieval preserves insert order after normalisation, minus dupes.
    const detail = await getTodoById('u1', created.id);
    expect(detail?.tagNames?.sort()).toEqual(['home', 'work']);
  });

  it('rolls back the todo insert when tag insert fails', async () => {
    // Pre-existing tag on a different todo; a duplicate insert would fail
    // the composite PK, but we test the compensation path by simulating a
    // batch failure via a bad tag character set — SQLite accepts any text
    // so instead we force failure by attempting the same tag twice inside
    // one createTodo call after canonicalisation collapses them (they
    // will not collide, actually). Instead, verify the roll-back path
    // exists by asserting no orphan todo when we hit the compensation.
    // Easiest deterministic trigger: monkey-patch the batch to reject.
    const clientMod = await import('@/lib/db/d1-client');
    const spy = vi
      .spyOn(clientMod, 'executeD1Batch')
      .mockRejectedValueOnce(new Error('boom'));
    await expect(
      createTodo('u1', { title: 'bad', tagNames: ['x'] }),
    ).rejects.toThrow(/boom/);
    spy.mockRestore();
    // The compensating DELETE must have removed the freshly-inserted row.
    expect(await getTodos('u1')).toHaveLength(0);
  });

  it('round-trips an emoji on insert (null by default)', async () => {
    const withoutEmoji = await createTodo('u1', { title: 'a' });
    expect(withoutEmoji.emoji).toBeNull();

    const withEmoji = await createTodo('u1', { title: 'b', emoji: '🎯' });
    expect(withEmoji.emoji).toBe('🎯');

    const detail = await getTodoById('u1', withEmoji.id);
    expect(detail?.emoji).toBe('🎯');
  });
});

/* -------------------------------------------------------------------------- */
/* Update                                                                     */
/* -------------------------------------------------------------------------- */

describe('updateTodo', () => {
  it('replaces tag names atomically', async () => {
    const t = await createTodo('u1', { title: 't', tagNames: ['a', 'b'] });
    await updateTodo('u1', t.id, { tagNames: ['c'] });
    const detail = await getTodoById('u1', t.id);
    expect(detail?.tagNames).toEqual(['c']);
  });

  it('flips done/doneAt in lockstep on state change and leaves doneAt intact on a no-op', async () => {
    const t = await makeRoot('u1', 't');
    const first = await updateTodo('u1', t, { done: true });
    expect(first?.done).toBe(true);
    expect(first?.doneAt).toBeInstanceOf(Date);

    // Second call passes done: true again — timestamp must not shift.
    if (!first || !first.doneAt) throw new Error('first update missing doneAt');
    const doneAtFirst = first.doneAt.getTime();
    await new Promise((r) => setTimeout(r, 5)); // ensure Date.now advances
    const second = await updateTodo('u1', t, { done: true });
    expect(second?.doneAt?.getTime()).toBe(doneAtFirst);

    // Unchecking clears doneAt.
    const third = await updateTodo('u1', t, { done: false });
    expect(third?.done).toBe(false);
    expect(third?.doneAt).toBeNull();
  });

  it('round-trips dueAt via Date', async () => {
    const t = await makeRoot('u1', 't');
    const due = new Date(2026, 6, 15, 23, 59, 59, 999);
    const patched = await updateTodo('u1', t, { dueAt: due });
    expect(patched?.dueAt?.getTime()).toBe(due.getTime());
    const cleared = await updateTodo('u1', t, { dueAt: null });
    expect(cleared?.dueAt).toBeNull();
  });

  it('sets / clears emoji via patch', async () => {
    const t = await makeRoot('u1', 't');
    const patched = await updateTodo('u1', t, { emoji: '📌' });
    expect(patched?.emoji).toBe('📌');
    const cleared = await updateTodo('u1', t, { emoji: null });
    expect(cleared?.emoji).toBeNull();
  });

  it('rewrites content + excerpt in lockstep, and clears excerpt when content set to null', async () => {
    const created = await createTodo('u1', {
      title: 't',
      content: '# original\n\nbody',
    });
    const patched = await updateTodo('u1', created.id, {
      content: '# updated\n\nnew body',
    });
    expect(patched?.content).toBe('# updated\n\nnew body');
    expect(patched?.excerpt).toContain('updated');

    const cleared = await updateTodo('u1', created.id, { content: null });
    expect(cleared?.content).toBeNull();
    expect(cleared?.excerpt).toBeNull();
  });

  it('returns null on missing id / wrong user', async () => {
    expect(await updateTodo('u1', 999, { title: 'x' })).toBeNull();
    const t = await makeRoot('u1', 't');
    expect(await updateTodo('u2', t, { title: 'x' })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Move (reparent)                                                            */
/* -------------------------------------------------------------------------- */

describe('moveTodo — reparent', () => {
  it('happy path: relocates the row + closes hole + opens slot + updates parent timestamps', async () => {
    const root = await makeRoot('u1', 'root');
    const other = await makeRoot('u1', 'other');
    const a = await makeChild('u1', root, 'a'); // pos 0 under root
    const b = await makeChild('u1', root, 'b'); // pos 1 under root
    const c = await makeChild('u1', other, 'c'); // pos 0 under other

    const before = await snapshot('u1');
    const rootUpdatedBefore = before.byId(root).updatedAt.getTime();
    const otherUpdatedBefore = before.byId(other).updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 3));

    const result = await moveTodo('u1', b, { parentId: other, position: 0 });
    expect(result.movedId).toBe(b);
    expect(result.oldParentId).toBe(root);
    expect(result.newParentId).toBe(other);
    expect(result.newParentSiblings).toEqual([b, c]); // b slotted in front

    const after = await snapshot('u1');
    expect(after.byId(b).parentId).toBe(other);
    expect(after.byId(b).position).toBe(0);
    expect(after.byId(c).position).toBe(1);
    expect(after.byId(a).position).toBe(0);
    // Both parents' updatedAt must move forward.
    expect(after.byId(root).updatedAt.getTime()).toBeGreaterThan(rootUpdatedBefore);
    expect(after.byId(other).updatedAt.getTime()).toBeGreaterThan(otherUpdatedBefore);
  });

  it('rejects self-parent with TodoMoveConflictError before hitting the DB', async () => {
    const t = await makeRoot('u1', 't');
    await expect(moveTodo('u1', t, { parentId: t, position: 0 })).rejects.toBeInstanceOf(
      TodoMoveConflictError,
    );
  });

  it('rejects a cycle via the write-time guard when moving an ancestor under its own descendant', async () => {
    const [g, p, c] = await makeChain('u1', 3); // g > p > c
    if (g === undefined || p === undefined || c === undefined) {
      throw new Error('makeChain(3) unexpectedly short');
    }
    // Attempt to place g under c would form g → c → p → g cycle.
    await expect(
      moveTodo('u1', g, { parentId: c, position: 0 }),
    ).rejects.toBeInstanceOf(TodoMoveConflictError);
    // Original tree preserved.
    const after = await snapshot('u1');
    expect(after.byId(g).parentId).toBeNull();
    expect(after.byId(p).parentId).toBe(g);
    expect(after.byId(c).parentId).toBe(p);
  });

  it('rejects cross-user parent — write-time EXISTS(newParent) predicate fails', async () => {
    const mine = await makeRoot('u1', 'mine');
    const theirs = await makeRoot('u2', 'theirs');
    await expect(
      moveTodo('u1', mine, { parentId: theirs, position: 0 }),
    ).rejects.toBeInstanceOf(TodoMoveConflictError);
  });

  it('rejects when the moved subtree would push depth past MAX_TODO_DEPTH', async () => {
    // Build a chain that is (MAX_TODO_DEPTH - 2) tall: root then n-3 children.
    // Attempt to move a 2-tall subtree under its deepest node — the total
    // depth becomes n which is fine; then attempt to move a 3-tall subtree
    // — total depth becomes n+1 which must be rejected.
    const chain = await makeChain('u1', MAX_TODO_DEPTH - 2); // depth = n-2
    const deepest = chain.at(-1);
    if (deepest === undefined) throw new Error('chain unexpectedly empty');
    // Build a fresh 2-tall subtree at root ready to be moved.
    const detachedRoot = await makeRoot('u1', 'detached-root');
    const detachedChild = await makeChild('u1', detachedRoot, 'detached-child');
    // detached subtree height = 1 (one edge), moving under deepest gives
    // new depth (n-2)+1+1 = n. n == MAX_TODO_DEPTH → still allowed.
    const ok = await moveTodo('u1', detachedRoot, {
      parentId: deepest,
      position: 0,
    });
    expect(ok.movedId).toBe(detachedRoot);
    // Now add one more child to that detached subtree — height = 2 — and
    // try to move something taller under a similarly-deep parent.
    const taller = await makeRoot('u1', 't-root');
    const tallerMid = await makeChild('u1', taller, 't-mid');
    await makeChild('u1', tallerMid, 't-leaf'); // height = 2
    await expect(
      moveTodo('u1', taller, { parentId: detachedChild, position: 0 }),
    ).rejects.toBeInstanceOf(TodoMoveConflictError);
  });

  it('cross-move race: only one of two mutually-cyclic moves can succeed', async () => {
    const a = await makeRoot('u1', 'a');
    const b = await makeRoot('u1', 'b');
    // The mock is synchronous per-call — schedule both moves in parallel
    // and record their outcomes. One must succeed and one must be rejected
    // by the guard, and the DB must be cycle-free afterwards.
    const results = await Promise.allSettled([
      moveTodo('u1', a, { parentId: b, position: 0 }),
      moveTodo('u1', b, { parentId: a, position: 0 }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // Post-condition: no cycle. Exactly one of {a, b} must be a root now.
    const after = await snapshot('u1');
    const parents = [after.byId(a).parentId, after.byId(b).parentId];
    expect(parents.filter((p) => p === null)).toHaveLength(1);
  });

  it('parent-deleted mid-move: guarded UPDATE\'s EXISTS predicate fails cleanly', async () => {
    const src = await makeRoot('u1', 'src');
    const dst = await makeRoot('u1', 'dst');
    // Delete dst just before the move; the write-time guard will see zero
    // rows in the ancestors CTE for the new parent and reject.
    await deleteTodo('u1', dst);
    await expect(
      moveTodo('u1', src, { parentId: dst, position: 0 }),
    ).rejects.toBeInstanceOf(TodoMoveConflictError);
    // And the src row must still exist at root.
    const after = await getTodoById('u1', src);
    expect(after?.parentId).toBeNull();
  });

  it('Phase 3 gap: if the moving row is tampered with between Phase 2 and Phase 3, no reconcile writes leak', async () => {
    // Regression for Reviewer round-1 blocker #1. The Phase 3 batch must
    // be gated end-to-end by "moving row is still parked at the Phase 2
    // safe-tail slot". If a racing operation shifted it in that gap, we
    // must abort *without* touching sibling positions or parent
    // updatedAt.
    const root = await makeRoot('u1', 'root');
    const other = await makeRoot('u1', 'other');
    const a = await makeChild('u1', root, 'a'); // pos 0
    const b = await makeChild('u1', root, 'b'); // pos 1  ← moving
    const c = await makeChild('u1', other, 'c'); // pos 0 under other

    const before = await snapshot('u1');
    const otherUpdatedBefore = before.byId(other).updatedAt.getTime();
    const cPositionBefore = before.byId(c).position;
    const aPositionBefore = before.byId(a).position;
    await new Promise((r) => setTimeout(r, 3));

    // Intercept the first executeD1Batch call (that is Phase 3 — Phase 2
    // runs via executeD1Query) and, just before letting it through, kick
    // the moving row off the safe-tail slot to simulate a concurrent op.
    const clientMod = await import('@/lib/db/d1-client');
    const originalBatch = clientMod.executeD1Batch;
    const spy = vi
      .spyOn(clientMod, 'executeD1Batch')
      .mockImplementationOnce(async (statements) => {
        // Simulate the winner of a race: bump the moving row's position to
        // some other value so the still-parked EXISTS check fails on
        // every subsequent Phase 3 statement.
        await originalBatch<Record<string, unknown>>([
          {
            sql: `UPDATE todos SET position = 999
                   WHERE id = ? AND user_id = ?`,
            params: [b, 'u1'],
          },
        ]);
        return originalBatch(statements);
      });

    await expect(
      moveTodo('u1', b, { parentId: other, position: 0 }),
    ).rejects.toBeInstanceOf(TodoMoveConflictError);
    spy.mockRestore();

    // Because every Phase 3 statement shared the still-parked guard, none
    // of the sibling shifts / parent touches applied. The only trace
    // should be the tamper itself (position=999 on b) — a, c, and both
    // parents' updatedAt must be exactly as before.
    const after = await snapshot('u1');
    expect(after.byId(a).position).toBe(aPositionBefore);
    expect(after.byId(c).position).toBe(cPositionBefore);
    expect(after.byId(other).updatedAt.getTime()).toBe(otherUpdatedBefore);
  });
});

/* -------------------------------------------------------------------------- */
/* Move (same-parent reorder branch)                                          */
/* -------------------------------------------------------------------------- */

describe('moveTodo — same-parent reorder', () => {
  it('shuffles siblings without running the cycle/depth SQL guard', async () => {
    const root = await makeRoot('u1', 'root');
    const a = await makeChild('u1', root, 'a');
    const b = await makeChild('u1', root, 'b');
    const c = await makeChild('u1', root, 'c');
    // Move c to position 0 → order becomes c, a, b.
    const result = await moveTodo('u1', c, { parentId: root, position: 0 });
    expect(result.oldParentId).toBe(root);
    expect(result.newParentId).toBe(root);
    expect(result.newParentSiblings).toEqual([c, a, b]);
    const after = await snapshot('u1');
    expect(after.byId(c).position).toBe(0);
    expect(after.byId(a).position).toBe(1);
    expect(after.byId(b).position).toBe(2);
  });

  it('clamps out-of-range positions supplied by the client', async () => {
    const root = await makeRoot('u1', 'root');
    const a = await makeChild('u1', root, 'a');
    const b = await makeChild('u1', root, 'b');
    // Pushing a to position 42 lands it at the tail (index 1).
    await moveTodo('u1', a, { parentId: root, position: 42 });
    const after = await snapshot('u1');
    expect(after.byId(b).position).toBe(0);
    expect(after.byId(a).position).toBe(1);
  });

  it('same-position "reorder" is a no-op touch: positions unchanged, updatedAt still bumps', async () => {
    const root = await makeRoot('u1', 'root');
    const a = await makeChild('u1', root, 'a');
    const b = await makeChild('u1', root, 'b');
    const before = await snapshot('u1');
    const bUpdatedBefore = before.byId(b).updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 3));

    const result = await moveTodo('u1', b, { parentId: root, position: 1 });
    expect(result.newParentSiblings).toEqual([a, b]);
    const after = await snapshot('u1');
    expect(after.byId(a).position).toBe(0);
    expect(after.byId(b).position).toBe(1);
    // The row's updated_at moves forward even on a no-op reorder — matches
    // how a text edit would flow through updateTodo.
    expect(after.byId(b).updatedAt.getTime()).toBeGreaterThan(bUpdatedBefore);
  });
});

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

describe('deleteTodo', () => {
  it('cascades the subtree and its tag rows', async () => {
    const root = await makeRoot('u1', 'root');
    const child = await makeChild('u1', root, 'child');
    await updateTodo('u1', child, { tagNames: ['work'] });
    expect(await deleteTodo('u1', root)).toBe(true);
    expect(await getTodos('u1')).toEqual([]);
    // Tag rows for the deleted subtree gone too.
    expect(await getTodoTags('u1')).toEqual([]);
  });

  it('returns false when the id is missing / owned by another user', async () => {
    const t = await makeRoot('u1', 't');
    expect(await deleteTodo('u2', t)).toBe(false);
    expect(await deleteTodo('u1', 999)).toBe(false);
    expect(await getTodos('u1')).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* reorderSiblings                                                            */
/* -------------------------------------------------------------------------- */

describe('reorderSiblings', () => {
  it('rewrites positions to match orderedIds', async () => {
    const root = await makeRoot('u1', 'root');
    const a = await makeChild('u1', root, 'a');
    const b = await makeChild('u1', root, 'b');
    const c = await makeChild('u1', root, 'c');
    await reorderSiblings('u1', root, [c, a, b]);
    const after = await snapshot('u1');
    expect(after.byId(c).position).toBe(0);
    expect(after.byId(a).position).toBe(1);
    expect(after.byId(b).position).toBe(2);
  });

  it('rejects an id set that includes a stranger (wrong user or wrong parent)', async () => {
    const p1 = await makeRoot('u1', 'p1');
    const p2 = await makeRoot('u1', 'p2');
    const a = await makeChild('u1', p1, 'a');
    const b = await makeChild('u1', p2, 'b'); // different parent
    await expect(reorderSiblings('u1', p1, [a, b])).rejects.toBeInstanceOf(
      TodoMoveConflictError,
    );
  });

  it('rejects a partial orderedIds set and leaves every sibling position untouched', async () => {
    // Regression for Reviewer round-1 blocker #2. A stale client that
    // omits a sibling would silently produce duplicate `position` values
    // if we accepted the partial input.
    const root = await makeRoot('u1', 'root');
    const a = await makeChild('u1', root, 'a');
    const b = await makeChild('u1', root, 'b');
    const c = await makeChild('u1', root, 'c');
    const before = await snapshot('u1');
    const positionsBefore = [a, b, c].map((id) => before.byId(id).position);

    await expect(
      reorderSiblings('u1', root, [c, a]), // b missing → partial
    ).rejects.toBeInstanceOf(TodoMoveConflictError);

    // No sibling's position should have shifted; a partial write would
    // have moved `c` to 0 and `a` to 1 while leaving `b` at 1 too.
    const after = await snapshot('u1');
    expect([a, b, c].map((id) => after.byId(id).position)).toEqual(
      positionsBefore,
    );
  });

  it('rejects duplicate ids in orderedIds', async () => {
    const root = await makeRoot('u1', 'root');
    const a = await makeChild('u1', root, 'a');
    const b = await makeChild('u1', root, 'b');
    await expect(
      reorderSiblings('u1', root, [a, a, b]),
    ).rejects.toBeInstanceOf(TodoMoveConflictError);
  });

  it('rejects an empty orderedIds when the parent still has siblings', async () => {
    const root = await makeRoot('u1', 'root');
    await makeChild('u1', root, 'a');
    await expect(reorderSiblings('u1', root, [])).rejects.toBeInstanceOf(
      TodoMoveConflictError,
    );
  });

  it('accepts an empty orderedIds when the parent has no siblings (no-op)', async () => {
    const root = await makeRoot('u1', 'root'); // leaf; no children
    await expect(reorderSiblings('u1', root, [])).resolves.toEqual([]);
  });
});
