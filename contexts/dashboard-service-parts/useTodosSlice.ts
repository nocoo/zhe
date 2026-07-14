"use client";

import { useCallback, useState } from "react";
import { getTodos } from "@/actions/todos";
import type { TodoTreeNode } from "@/lib/db/scoped";

/**
 * Owns the todos slice of the dashboard context. Todos are lazy-loaded
 * (first pulled when the global search dialog opens or the Todos page
 * mounts) so the initial page-load stays lean for users who don't touch
 * the feature. Mirrors `useIdeasSlice` in shape and semantics — the same
 * loaded/loading gate keeps repeated `ensureTodosLoaded()` calls cheap.
 *
 * The slice deliberately owns only the flat `TodoTreeNode[]` list — tree
 * assembly, filters, DnD, and mutation UX live in `useTodosViewModel`
 * (C8). The provider hands each Todos page its own VM instance; this
 * slice is here so Global Search (Cmd+K) and future counters can read
 * from a single shared cache without a second round-trip.
 */
export function useTodosSlice() {
  const [todos, setTodos] = useState<TodoTreeNode[]>([]);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todosLoaded, setTodosLoaded] = useState(false);

  const ensureTodosLoaded = useCallback(async () => {
    if (todosLoaded || todosLoading) return;
    setTodosLoading(true);
    try {
      const result = await getTodos();
      if (result.success && result.data) {
        setTodos(result.data);
        setTodosLoaded(true);
      }
    } catch (error) {
      console.error("Failed to load todos:", error);
    } finally {
      setTodosLoading(false);
    }
  }, [todosLoaded, todosLoading]);

  const refreshTodos = useCallback(async () => {
    setTodosLoading(true);
    try {
      const result = await getTodos();
      if (result.success && result.data) setTodos(result.data);
      setTodosLoaded(true);
    } catch (error) {
      console.error("Failed to refresh todos:", error);
    } finally {
      setTodosLoading(false);
    }
  }, []);

  const handleTodoCreated = useCallback((todo: TodoTreeNode) => {
    // Prepend to match ideas' newest-first cache order. The Todos page has
    // its own local ordering (parent → position from `useTodosViewModel`),
    // so this shared cache is only consumed by Global Search / counters
    // where insertion order does not matter.
    setTodos((prev) => [todo, ...prev]);
  }, []);

  const handleTodoDeleted = useCallback((id: number) => {
    // FK cascade means the server dropped every descendant too; walk the
    // flat list until the doomed-set is stable so the shared cache stays
    // consistent with the DB. Trees are shallow (docs cap depth at 12),
    // so this is trivially bounded.
    setTodos((prev) => {
      const doomed = new Set<number>([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of prev) {
          if (n.parentId !== null && doomed.has(n.parentId) && !doomed.has(n.id)) {
            doomed.add(n.id);
            grew = true;
          }
        }
      }
      return prev.filter((n) => !doomed.has(n.id));
    });
  }, []);

  const handleTodoUpdated = useCallback((updated: TodoTreeNode) => {
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  return {
    todos,
    todosLoading,
    ensureTodosLoaded,
    refreshTodos,
    handleTodoCreated,
    handleTodoDeleted,
    handleTodoUpdated,
  };
}
