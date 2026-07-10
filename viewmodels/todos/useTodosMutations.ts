"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { MoveTodoResult, TodoDetail, TodoTreeNode } from "@/lib/db/scoped";
import {
  createTodo,
  deleteTodo,
  moveTodo,
  reorderTodoSiblings,
  updateTodo,
} from "@/actions/todos";

/**
 * Optimistic-first CRUD + move + reorder for the todo tree.
 *
 * Every mutation:
 *   1. snapshots the current `todos` array (rollback source)
 *   2. writes the optimistic patch locally
 *   3. calls the server action
 *   4. on success reconciles against server truth
 *   5. on failure restores the snapshot and surfaces `error`
 *
 * Rollback matters most for `handleMoveTodo` / `handleReorderSiblings`:
 * a `TodoMoveConflictError` will bubble as a rejected `ActionResult`, and
 * the tree must snap back to the pre-drag state instead of freezing in a
 * half-applied position.
 */
export function useTodosMutations(
  setTodos: Dispatch<SetStateAction<TodoTreeNode[]>>,
) {
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectDetail = useCallback((detail: TodoDetail): TodoTreeNode => ({
    id: detail.id,
    parentId: detail.parentId,
    position: detail.position,
    title: detail.title,
    done: detail.done,
    hasContent: detail.hasContent,
    excerpt: detail.excerpt,
    tagNames: detail.tagNames,
    dueAt: detail.dueAt,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  }), []);

  const handleCreateTodo = useCallback(
    async (input: Parameters<typeof createTodo>[0]) => {
      setIsSaving(true);
      setError(null);
      try {
        const result = await createTodo(input);
        if (result.success && result.data) {
          const projected = projectDetail(result.data);
          setTodos((prev) => [...prev, projected]);
          return result.data;
        }
        setError(result.error ?? "Failed to create todo");
        return null;
      } catch (err) {
        console.error("Failed to create todo:", err);
        setError("Failed to create todo");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [projectDetail, setTodos],
  );

  const handleUpdateTodo = useCallback(
    async (id: number, input: Parameters<typeof updateTodo>[1]) => {
      let snapshot: TodoTreeNode[] = [];
      setTodos((prev) => {
        snapshot = prev;
        return prev.map((n) => {
          if (n.id !== id) return n;
          const patched = { ...n };
          if (input.title !== undefined) patched.title = input.title;
          if (input.done !== undefined) patched.done = input.done;
          if (input.tagNames !== undefined) patched.tagNames = input.tagNames;
          if (input.dueAtMs !== undefined) {
            patched.dueAt = input.dueAtMs === null ? null : new Date(input.dueAtMs);
          }
          if (input.content !== undefined) {
            patched.hasContent = input.content !== null && input.content !== "";
          }
          return patched;
        });
      });

      setIsSaving(true);
      setError(null);
      try {
        const result = await updateTodo(id, input);
        if (result.success && result.data) {
          const projected = projectDetail(result.data);
          setTodos((prev) => prev.map((n) => (n.id === id ? projected : n)));
          return result.data;
        }
        setTodos(snapshot);
        setError(result.error ?? "Failed to update todo");
        return null;
      } catch (err) {
        console.error("Failed to update todo:", err);
        setTodos(snapshot);
        setError("Failed to update todo");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [projectDetail, setTodos],
  );

  const handleDeleteTodo = useCallback(
    async (id: number) => {
      let snapshot: TodoTreeNode[] = [];
      // Optimistically drop the row + its whole subtree.
      setTodos((prev) => {
        snapshot = prev;
        const descendants = new Set<number>([id]);
        // Walk breadth-first over the flat list; O(n * depth) worst case,
        // but todo trees are small (docs cap depth at 12).
        let grew = true;
        while (grew) {
          grew = false;
          for (const n of prev) {
            if (n.parentId !== null && descendants.has(n.parentId) && !descendants.has(n.id)) {
              descendants.add(n.id);
              grew = true;
            }
          }
        }
        return prev.filter((n) => !descendants.has(n.id));
      });

      setIsDeleting(true);
      setError(null);
      try {
        const result = await deleteTodo(id);
        if (result.success) return true;
        setTodos(snapshot);
        setError(result.error ?? "Failed to delete todo");
        return false;
      } catch (err) {
        console.error("Failed to delete todo:", err);
        setTodos(snapshot);
        setError("Failed to delete todo");
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [setTodos],
  );

  const handleMoveTodo = useCallback(
    async (id: number, input: Parameters<typeof moveTodo>[1]) => {
      // For a move the server's returned slice is authoritative — it
      // contains the post-move sibling orders for both parents. We skip
      // the optimistic write here and let the server response drive the
      // reshuffle; the DnD callback already updates the UI mid-drag via
      // react-arborist's local state, so the network-latency window is
      // covered visually.
      setIsSaving(true);
      setError(null);
      try {
        const result = await moveTodo(id, input);
        if (result.success && result.data) {
          applyMoveResult(setTodos, result.data);
          return result.data;
        }
        setError(result.error ?? "Failed to move todo");
        return null;
      } catch (err) {
        console.error("Failed to move todo:", err);
        setError("Failed to move todo");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [setTodos],
  );

  const handleReorderSiblings = useCallback(
    async (parentId: number | null, orderedIds: readonly number[]) => {
      let snapshot: TodoTreeNode[] = [];
      setTodos((prev) => {
        snapshot = prev;
        const idIndex = new Map(orderedIds.map((cid, i) => [cid, i]));
        return prev.map((n) => {
          const idx = idIndex.get(n.id);
          if (idx === undefined) return n;
          if (n.parentId !== parentId) return n;
          if (n.position === idx) return n;
          return { ...n, position: idx };
        });
      });

      setIsSaving(true);
      setError(null);
      try {
        const result = await reorderTodoSiblings(parentId, orderedIds);
        if (result.success) return true;
        setTodos(snapshot);
        setError(result.error ?? "Failed to reorder todos");
        return false;
      } catch (err) {
        console.error("Failed to reorder todos:", err);
        setTodos(snapshot);
        setError("Failed to reorder todos");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [setTodos],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    isSaving,
    isDeleting,
    error,
    handleCreateTodo,
    handleUpdateTodo,
    handleDeleteTodo,
    handleMoveTodo,
    handleReorderSiblings,
    clearError,
  };
}

/**
 * Merge a Phase-4 move slice into the local flat tree. The slice tells
 * us the post-move sibling id order for both parents; we rewrite each
 * matching row's `parentId` / `position` accordingly and leave everything
 * else untouched. Extracted for testability.
 */
export function applyMoveResult(
  setTodos: Dispatch<SetStateAction<TodoTreeNode[]>>,
  result: MoveTodoResult,
): void {
  const parentAssignments = new Map<number, number | null>();
  const positionAssignments = new Map<number, number>();
  for (let i = 0; i < result.oldParentSiblings.length; i += 1) {
    const childId = result.oldParentSiblings[i];
    if (childId !== undefined) {
      parentAssignments.set(childId, result.oldParentId);
      positionAssignments.set(childId, i);
    }
  }
  for (let i = 0; i < result.newParentSiblings.length; i += 1) {
    const childId = result.newParentSiblings[i];
    if (childId !== undefined) {
      parentAssignments.set(childId, result.newParentId);
      positionAssignments.set(childId, i);
    }
  }
  parentAssignments.set(result.movedId, result.newParentId);

  setTodos((prev) =>
    prev.map((n) => {
      if (!parentAssignments.has(n.id) && !positionAssignments.has(n.id)) {
        return n;
      }
      // `??` would swallow a legitimate `null` (= "move to root") in the
      // parent assignment map, so branch on `has()`. Same reason we don't
      // collapse the ternary — root moves are the interesting case.
      const nextParent = parentAssignments.has(n.id)
        ? (parentAssignments.get(n.id) as number | null)
        : n.parentId;
      const nextPos = positionAssignments.has(n.id)
        ? (positionAssignments.get(n.id) as number)
        : n.position;
      if (n.parentId === nextParent && n.position === nextPos) return n;
      return { ...n, parentId: nextParent, position: nextPos };
    }),
  );
}
