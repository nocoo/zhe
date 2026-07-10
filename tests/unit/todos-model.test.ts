// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TodoTreeNode } from "@/lib/db/scoped";
import { filterTodos, todoForestFromFlat } from "@/models/todos";

/** Minimal factory keeping unrelated fields deterministic. */
function node(overrides: Partial<TodoTreeNode> & { id: number }): TodoTreeNode {
  return {
    id: overrides.id,
    parentId: overrides.parentId ?? null,
    position: overrides.position ?? 0,
    title: overrides.title ?? `todo-${overrides.id}`,
    done: overrides.done ?? false,
    hasContent: overrides.hasContent ?? false,
    tagNames: overrides.tagNames ?? [],
    dueAt: overrides.dueAt ?? null,
    createdAt: overrides.createdAt ?? new Date(0),
    updatedAt: overrides.updatedAt ?? new Date(0),
  };
}

describe("todoForestFromFlat", () => {
  it("assembles a forest with siblings sorted by (position, id)", () => {
    const flat = [
      node({ id: 1, position: 0 }),
      node({ id: 2, parentId: 1, position: 1 }),
      node({ id: 3, parentId: 1, position: 0 }),
      // Position tie between 2 and 4 — id tiebreak keeps 2 before 4.
      node({ id: 4, parentId: 1, position: 1 }),
    ];
    const forest = todoForestFromFlat(flat);
    expect(forest).toHaveLength(1);
    const root = forest[0];
    if (!root) throw new Error("expected root");
    expect(root.children.map((c) => c.id)).toEqual([3, 2, 4]);
  });

  it("promotes orphans to roots so a stale cache cannot swallow a subtree", () => {
    const flat = [
      node({ id: 10, parentId: 99, position: 0 }), // parent 99 missing
    ];
    const forest = todoForestFromFlat(flat);
    expect(forest).toHaveLength(1);
    const only = forest[0];
    if (!only) throw new Error("expected orphan");
    expect(only.id).toBe(10);
    expect(only.parentId).toBeNull(); // promoted
  });
});

describe("filterTodos", () => {
  const now = new Date(2026, 6, 10, 12, 0);

  it("returns the input untouched when no filters apply", () => {
    const flat = [node({ id: 1 }), node({ id: 2, parentId: 1 })];
    expect(filterTodos(flat)).toEqual(flat);
  });

  it("hides done rows when showDone=false", () => {
    const flat = [
      node({ id: 1 }),
      node({ id: 2, parentId: 1, done: true, title: "x" }),
    ];
    const result = filterTodos(flat, { showDone: false });
    expect(result.map((n) => n.id)).toEqual([1]);
  });

  it("substring-matches title case-insensitively and pulls ancestors along", () => {
    const flat = [
      node({ id: 1, title: "Personal projects" }),
      node({ id: 2, parentId: 1, title: "Buy Milk" }),
      node({ id: 3, parentId: 1, title: "Read book" }),
    ];
    const result = filterTodos(flat, { query: "MILK" });
    // Match on child #2 must keep parent #1 in view so it stays navigable.
    expect(result.map((n) => n.id).sort()).toEqual([1, 2]);
  });

  it("filters by tagName using the canonical (lowercase) name", () => {
    const flat = [
      node({ id: 1, tagNames: ["work"] }),
      node({ id: 2, tagNames: ["home"] }),
    ];
    expect(filterTodos(flat, { tagName: "work" }).map((n) => n.id)).toEqual([1]);
  });

  it('due-filter "overdue" keeps only overdue rows plus their ancestors', () => {
    const yesterday = new Date(2026, 6, 9, 12, 0);
    const flat = [
      node({ id: 1, title: "root" }),
      node({ id: 2, parentId: 1, dueAt: yesterday }),
      node({ id: 3, parentId: 1, dueAt: null }),
    ];
    const result = filterTodos(flat, { dueKind: "overdue", now });
    expect(result.map((n) => n.id).sort()).toEqual([1, 2]);
  });

  it('due-filter "any-due" keeps every row that has a dueAt (plus ancestors)', () => {
    const later = new Date(2026, 6, 20, 12, 0);
    const flat = [
      node({ id: 1, title: "root" }),
      node({ id: 2, parentId: 1, dueAt: later }),
      node({ id: 3, parentId: 1 }),
    ];
    const result = filterTodos(flat, { dueKind: "any-due", now });
    expect(result.map((n) => n.id).sort()).toEqual([1, 2]);
  });
});
