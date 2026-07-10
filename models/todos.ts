/**
 * Pure helpers for todo tree rendering. The server returns a flat list of
 * `TodoTreeNode` (sorted by `parentId, position`); the client reshapes it
 * into a react-arborist-compatible forest and applies text/tag/due/done
 * filters without a re-fetch.
 *
 * Keep this file pure — no React, no server actions — so it can be
 * unit-tested against fixtures and reused by the Global Search integration
 * (see docs/21-todos-feature.md).
 */

import type { TodoTreeNode } from "@/lib/db/scoped";
import { dueStatus, type DueStatus } from "@/lib/todo-due";

/** A node in the tree the UI actually renders. Adds `children`. */
export interface TodoForestNode extends TodoTreeNode {
  children: TodoForestNode[];
}

/**
 * Build the forest from the flat list produced by `getTodos`. Sibling
 * ordering follows `position` then `id` (the tiebreak matches the DB's
 * `ORDER BY position, id`, so two rows with the same `position` — the
 * transient state described in docs/21-todos-feature.md when a move
 * crashes between phases — still render in a stable order).
 *
 * Orphans (whose `parentId` is not in the input) are silently promoted to
 * roots so a partially-stale client cache cannot swallow their subtree.
 */
export function todoForestFromFlat(
  nodes: readonly TodoTreeNode[],
): TodoForestNode[] {
  const byId = new Map<number, TodoForestNode>();
  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [] });
  }
  const roots: TodoForestNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parentId);
    if (parent) parent.children.push(node);
    // Orphan → promote to root instead of dropping.
    else roots.push({ ...node, parentId: null });
  }
  const sortSiblings = (list: TodoForestNode[]) => {
    list.sort((a, b) => (a.position - b.position) || (a.id - b.id));
    for (const child of list) sortSiblings(child.children);
  };
  sortSiblings(roots);
  return roots;
}

/** Options for `filterTodos`. All optional; missing = no filter for that axis. */
export interface TodoFilterOptions {
  /** Case-insensitive substring against title. */
  query?: string | undefined;
  /** Show completed todos. Default `true` — set `false` to hide `done`. */
  showDone?: boolean | undefined;
  /** Restrict to nodes that carry this tag. Compared to the canonical name. */
  tagName?: string | undefined;
  /** Restrict by due-status kind: 'overdue' | 'today' | 'later-or-none' etc. */
  dueKind?: DueStatus["kind"] | "any-due" | undefined;
  /** Reference "now" for due-kind computation; defaults to `new Date()`. */
  now?: Date | undefined;
}

/**
 * Filter a flat list of nodes by the given axes. The result is still
 * flat and still in server order — call `todoForestFromFlat` afterwards
 * if you want a tree.
 *
 * Filtering the tree flat first (then re-hydrating) is deliberate: a
 * match on a deep child needs to keep its ancestors visible so it stays
 * navigable, and doing that at forest-shape time forces one recursion per
 * filter axis. Flat filtering is O(n) per axis; the ancestor-preservation
 * step is one extra pass.
 */
export function filterTodos(
  nodes: readonly TodoTreeNode[],
  options: TodoFilterOptions = {},
): TodoTreeNode[] {
  const { query, showDone = true, tagName, dueKind, now = new Date() } =
    options;
  const trimmedQuery = query?.trim().toLowerCase() ?? "";
  const wantsDueMatch = dueKind !== undefined;

  const matchedIds = new Set<number>();
  for (const node of nodes) {
    if (!showDone && node.done) continue;
    if (trimmedQuery) {
      const titleHit = node.title.toLowerCase().includes(trimmedQuery);
      const excerptHit =
        node.excerpt !== null &&
        node.excerpt.toLowerCase().includes(trimmedQuery);
      if (!titleHit && !excerptHit) continue;
    }
    if (tagName && !node.tagNames.includes(tagName)) continue;
    if (wantsDueMatch) {
      const status = dueStatus(now, node.dueAt, node.done);
      if (dueKind === "any-due") {
        if (status.kind === "no-due") continue;
      } else if (status.kind !== dueKind) {
        continue;
      }
    }
    matchedIds.add(node.id);
  }

  if (matchedIds.size === nodes.length) return [...nodes];

  // Preserve ancestor chain so a deep hit stays navigable. Building an
  // id→parentId map keeps ancestor walks O(depth) per hit.
  const parentById = new Map<number, number | null>();
  for (const node of nodes) parentById.set(node.id, node.parentId);

  const visible = new Set<number>();
  for (const id of matchedIds) {
    let cursor: number | null | undefined = id;
    while (cursor !== null && cursor !== undefined && !visible.has(cursor)) {
      visible.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  return nodes.filter((n) => visible.has(n.id));
}
