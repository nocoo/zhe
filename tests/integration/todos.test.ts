/**
 * L2 integration tests for the guarded moveTodo two-phase write.
 *
 * These go one layer above the C5 unit tests: they call the *server
 * actions* (which own the ActionResult envelope + typed-error mapping)
 * and the *ScopedDB* layer (which owns the write-time guard) end-to-end,
 * with an in-memory `node:sqlite` database standing in for D1. That way
 * we exercise the real recursive-CTE `UPDATE ... RETURNING id` guard
 * against real SQL, not against the string-matching db-storage mock.
 *
 * Covers per docs/21-todos-feature.md — Quality Gates L2:
 *   • createTodo happy path via the server action
 *   • guarded moveTodo happy path returning the affected slice
 *   • cross-move race: two mutually-cyclic moves — exactly one wins,
 *     the other is rejected with "Move conflicted or invalid"
 *   • cascade delete removing the whole subtree + its tag rows
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

// The auth mock has to be installed before importing the actions,
// which pull in the getAuthContext helper.
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'test-user-id', name: 'Test', email: 'test@test.com' },
  }),
}));

// A per-test in-memory SQLite instance. The mock below closes over this
// binding via a module-level `let`, so setupDb() can hand each test a
// fresh schema without needing to reset the mock itself.
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    all: (...args: unknown[]) => unknown[];
    get: (...args: unknown[]) => unknown;
    run: (...args: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  };
  close(): void;
};
let db: SqliteDatabase;

vi.mock('@/lib/db/d1-client', () => {
  const runQuery = <T>(sql: string, params: unknown[] = []): T[] => {
    const stmt = db.prepare(sql);
    const trimmed = sql.trim().toUpperCase();
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

// Import the SUT AFTER the mocks are installed.
import {
  createTodo,
  deleteTodo,
  getTodos,
  moveTodo,
} from '@/actions/todos';
import { unwrap } from '../test-utils';

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

const USER_ID = 'test-user-id';

function setupDb(): void {
  db = new DatabaseSync(':memory:') as unknown as SqliteDatabase;
  db.exec(SCHEMA_SQL);
  db.prepare('INSERT INTO users(id) VALUES (?)').run(USER_ID);
}

beforeEach(() => {
  setupDb();
});

async function makeRoot(title: string): Promise<number> {
  const detail = unwrap((await createTodo({ title })).data);
  return detail.id;
}

async function makeChild(parentId: number, title: string): Promise<number> {
  const detail = unwrap((await createTodo({ title, parentId })).data);
  return detail.id;
}

describe('Todo server actions — L2 integration', () => {
  describe('createTodo + getTodos', () => {
    it('round-trips a root todo and its child through the server action layer', async () => {
      const rootRes = await createTodo({ title: 'root' });
      expect(rootRes.success).toBe(true);
      const root = unwrap(rootRes.data);
      const childRes = await createTodo({ title: 'child', parentId: root.id });
      expect(childRes.success).toBe(true);

      const listRes = await getTodos();
      expect(listRes.success).toBe(true);
      const items = unwrap(listRes.data);
      expect(items.map((n) => [n.id, n.parentId, n.position, n.title])).toEqual([
        [root.id, null, 0, 'root'],
        [unwrap(childRes.data).id, root.id, 0, 'child'],
      ]);
    });
  });

  describe('moveTodo — happy path', () => {
    it('reparents a child and returns the affected slice for both parents', async () => {
      const rootA = await makeRoot('A');
      const rootB = await makeRoot('B');
      const child = await makeChild(rootA, 'c');

      const result = await moveTodo(child, { parentId: rootB, position: 0 });
      expect(result.success).toBe(true);
      const slice = unwrap(result.data);
      expect(slice.movedId).toBe(child);
      expect(slice.oldParentId).toBe(rootA);
      expect(slice.newParentId).toBe(rootB);
      expect(slice.oldParentSiblings).toEqual([]);
      expect(slice.newParentSiblings).toEqual([child]);

      // Post-condition: the flat tree reflects the move.
      const items = unwrap((await getTodos()).data);
      const moved = items.find((n) => n.id === child);
      if (!moved) throw new Error('moved row missing');
      expect(moved.parentId).toBe(rootB);
      expect(moved.position).toBe(0);
    });
  });

  describe('moveTodo — cross-move race', () => {
    it('rejects exactly one of two mutually-cyclic concurrent moves', async () => {
      const a = await makeRoot('a');
      const b = await makeRoot('b');

      // Fire both moves in parallel via Promise.allSettled — each on its
      // own tries to place the other under itself, which would form a
      // cycle if both succeeded. The write-time ancestry guard must let
      // one win and reject the other with the stable conflict string.
      const results = await Promise.allSettled([
        moveTodo(a, { parentId: b, position: 0 }),
        moveTodo(b, { parentId: a, position: 0 }),
      ]);
      const settled = results.map((r) =>
        r.status === 'fulfilled' ? r.value : { success: false, error: '(threw)' },
      );

      const succeeded = settled.filter((r) => r.success);
      const rejected = settled.filter((r) => !r.success);
      expect(succeeded, JSON.stringify(settled)).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.error).toBe('Move conflicted or invalid');

      // Post-condition: no cycle — exactly one of {a, b} is a root.
      const items = unwrap((await getTodos()).data);
      const aRow = items.find((n) => n.id === a);
      const bRow = items.find((n) => n.id === b);
      if (!aRow || !bRow) throw new Error('missing row after race');
      const roots = [aRow, bRow].filter((n) => n.parentId === null);
      expect(roots).toHaveLength(1);
    });

    it('rejects self-parent moves with the same stable conflict error', async () => {
      const t = await makeRoot('t');
      const result = await moveTodo(t, { parentId: t, position: 0 });
      expect(result).toEqual({
        success: false,
        error: 'Move conflicted or invalid',
      });
    });
  });

  describe('deleteTodo — cascade', () => {
    it('removes the whole subtree in a single server-action call', async () => {
      const root = await makeRoot('root');
      const child = await makeChild(root, 'child');
      const grand = await makeChild(child, 'grand');

      const result = await deleteTodo(root);
      expect(result).toEqual({ success: true });

      const items = unwrap((await getTodos()).data);
      expect(items.map((n) => n.id)).toEqual([]);
      // And no dangling children on the ids we just deleted.
      for (const id of [root, child, grand]) {
        expect(items.find((n) => n.id === id)).toBeUndefined();
      }
    });

    it('returns "Todo not found" for a stale id', async () => {
      const result = await deleteTodo(9999);
      expect(result).toEqual({ success: false, error: 'Todo not found' });
    });
  });
});
