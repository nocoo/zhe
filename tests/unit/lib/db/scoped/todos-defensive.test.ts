// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTodo, moveTodo, reorderSiblings, updateTodo } from "@/lib/db/scoped/todos";
import { TodoMoveConflictError } from "@/lib/db/scoped/types";

let db: DatabaseSync;
const flags = {
  insertReturningEmpty: false,
  batchStatementsEmptyRows: false,
  batchEmptyList: false,
  siblingCountMissing: false,
  heightQueryMissing: false,
};
const flagHits: { siblingCountMissing: number; heightQueryMissing: number } = {
  siblingCountMissing: 0,
  heightQueryMissing: 0,
};

vi.mock("@/lib/db/d1-client", () => ({
  isD1Configured: () => true,
  executeD1Query: async (sql: string, params: SQLInputValue[] = []) => {
    if (flags.insertReturningEmpty && /^INSERT/i.test(sql.trim()) && /RETURNING/i.test(sql)) {
      return [];
    }
    if (flags.siblingCountMissing && sql.includes("COUNT(1) AS cnt FROM todos")) {
      flagHits.siblingCountMissing += 1;
      return [];
    }
    if (flags.heightQueryMissing && sql.includes("WITH RECURSIVE")) {
      flagHits.heightQueryMissing += 1;
      return [];
    }
    return db.prepare(sql).all(...params);
  },
  executeD1Batch: async (statements: { sql: string; params?: SQLInputValue[] }[]) => {
    if (flags.batchEmptyList) return [];
    if (flags.batchStatementsEmptyRows) return statements.map(() => []);
    return statements.map((s) => db.prepare(s.sql).all(...(s.params ?? [])));
  },
}));

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
  CREATE INDEX idx_todos_user_parent ON todos(user_id, parent_id, position);
`;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  db.prepare("INSERT INTO users(id) VALUES (?)").run("u1");
  flags.insertReturningEmpty = false;
  flags.batchStatementsEmptyRows = false;
  flags.batchEmptyList = false;
  flags.siblingCountMissing = false;
  flags.heightQueryMissing = false;
  flagHits.siblingCountMissing = 0;
  flagHits.heightQueryMissing = 0;
});
afterEach(() => db.close());

describe("createTodo defensive branches", () => {
  it("fails loudly when INSERT RETURNING yields no row", async () => {
    flags.insertReturningEmpty = true;
    await expect(createTodo("u1", { title: "orphan" })).rejects.toThrow("Failed to create todo");
  });

  it("treats a missing recursive-height result as a missing parent", async () => {
    const root = await createTodo("u1", { title: "root" });
    flags.heightQueryMissing = true;
    // No CTE row means the depth cannot be confirmed; create treats it as a
    // missing parent rather than guessing depth zero.
    await expect(createTodo("u1", { title: "child", parentId: root.id })).rejects.toThrow(
      "Parent todo not found",
    );
    expect(flagHits.heightQueryMissing).toBeGreaterThan(0);
    flags.heightQueryMissing = false;
    const child = await createTodo("u1", { title: "child", parentId: root.id });
    expect(child.parentId).toBe(root.id);
  });
});

describe("updateTodo defensive branches", () => {
  it("returns null when the update batch produces no row", async () => {
    const todo = await createTodo("u1", { title: "before" });
    flags.batchStatementsEmptyRows = true;
    expect(await updateTodo("u1", todo.id, { title: "after" })).toBeNull();
  });
});

describe("moveTodo defensive branches", () => {
  it("clamps the target position when the sibling count row is missing", async () => {
    const rootA = await createTodo("u1", { title: "rootA" });
    const rootB = await createTodo("u1", { title: "rootB" });
    const c1 = await createTodo("u1", { title: "c1", parentId: rootA.id });

    flags.siblingCountMissing = true;
    const res = await moveTodo("u1", c1.id, { parentId: rootB.id, position: 5 });
    expect(flagHits.siblingCountMissing).toBeGreaterThan(0);
    flags.siblingCountMissing = false;

    // A missing count row falls back to zero siblings, clamping position 5
    // down to index 0 — the only occupant of rootB is the moved row itself.
    expect(res.movedId).toBe(c1.id);
    expect(res.newParentSiblings).toEqual([c1.id]);
    expect(res.oldParentSiblings).toEqual([]);
    const persisted = db.prepare("SELECT position FROM todos WHERE id = ?").get(c1.id) as {
      position: number;
    };
    expect(persisted.position).toBe(0);
  });

  it("aborts with a conflict when the relocate statement returns nothing", async () => {
    const rootA = await createTodo("u1", { title: "rootA" });
    const rootB = await createTodo("u1", { title: "rootB" });
    const c1 = await createTodo("u1", { title: "c1", parentId: rootA.id });

    flags.batchEmptyList = true;
    await expect(moveTodo("u1", c1.id, { parentId: rootB.id, position: 0 })).rejects.toBeInstanceOf(
      TodoMoveConflictError,
    );
  });
});

describe("reorderSiblings foreign id guard", () => {
  it("rejects an orderedIds entry that is not a child of the parent", async () => {
    const root = await createTodo("u1", { title: "root" });
    const c1 = await createTodo("u1", { title: "c1", parentId: root.id });
    const outsider = await createTodo("u1", { title: "outsider" });

    await expect(reorderSiblings("u1", root.id, [c1.id, outsider.id])).rejects.toBeInstanceOf(
      TodoMoveConflictError,
    );
  });
});
