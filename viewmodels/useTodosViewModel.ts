"use client";

import { useCallback, useEffect, useState } from "react";
import { getTodo, getTodos } from "@/actions/todos";
import type { TodoDetail, TodoTreeNode } from "@/lib/db/scoped";
import { type TodoForestNode, todoForestFromFlat } from "@/models/todos";
import { useTodosDnd } from "./todos/useTodosDnd";
import { useTodosFilters } from "./todos/useTodosFilters";
import { useTodosMutations } from "./todos/useTodosMutations";

export type TodosViewModel = ReturnType<typeof useTodosViewModel>;

/**
 * Lazily fetch the flat todo tree on mount and expose it plus a
 * `refresh` handle. Same shape as `useIdeasData` in the ideas VM so the
 * two modules stay diffable.
 */
function useTodosData() {
  const [todos, setTodos] = useState<TodoTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchTodos() {
      setLoading(true);
      try {
        const result = await getTodos();
        if (cancelled) return;
        if (result.success && result.data) setTodos(result.data);
      } catch (err) {
        console.error("Failed to fetch todos:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTodos();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshTodos = useCallback(async () => {
    const result = await getTodos();
    if (result.success && result.data) setTodos(result.data);
  }, []);

  return { todos, setTodos, loading, refreshTodos };
}

/** Delete-confirm dialog state. */
function useDeleteConfirm() {
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [todoToDelete, setTodoToDelete] = useState<TodoTreeNode | null>(null);

  const confirmDelete = useCallback((todo: TodoTreeNode) => {
    setTodoToDelete(todo);
    setIsDeleteConfirmOpen(true);
  }, []);

  const cancelDelete = useCallback(() => {
    setTodoToDelete(null);
    setIsDeleteConfirmOpen(false);
  }, []);

  const reset = useCallback(() => {
    setIsDeleteConfirmOpen(false);
    setTodoToDelete(null);
  }, []);

  return { isDeleteConfirmOpen, todoToDelete, confirmDelete, cancelDelete, reset };
}

/**
 * Selection + right-pane detail cache. Selection follows the tree; the
 * right pane lazily fetches full `TodoDetail` on first hit so the initial
 * `getTodos` payload can stay content-free.
 */
function useSelection() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TodoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (selectedId === null) {
      // Explicitly clear the spinner too — a pending fetch from a
      // previously-selected id would otherwise keep `detailLoading` true
      // forever (the old effect's cleanup marks itself cancelled, so its
      // finally never fires the setter).
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    (async () => {
      try {
        const result = await getTodo(selectedId);
        if (cancelled) return;
        if (result.success && result.data) setDetail(result.data);
        else setDetail(null);
      } catch (err) {
        console.error("Failed to fetch todo detail:", err);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return { selectedId, setSelectedId, detail, setDetail, detailLoading };
}

/**
 * Todos viewmodel — composes data, mutations, filters, DnD, selection,
 * and the delete-confirm dialog. The right pane and left tree both read
 * from this single VM instance so a mutation on either side stays in
 * sync via the shared `todos` state.
 */
export function useTodosViewModel() {
  const { todos, setTodos, loading, refreshTodos } = useTodosData();
  const mutations = useTodosMutations(setTodos);
  const filters = useTodosFilters(todos);
  const selection = useSelection();
  const dnd = useTodosDnd({ handleMoveTodo: mutations.handleMoveTodo });
  const deleteConfirm = useDeleteConfirm();

  const forest: TodoForestNode[] = todoForestFromFlat(filters.filteredTodos);

  const executeDelete = useCallback(async () => {
    if (!deleteConfirm.todoToDelete) return;
    const rootId = deleteConfirm.todoToDelete.id;
    // Compute the doomed subtree BEFORE the delete runs — the mutation
    // does an optimistic drop, so `todos` will no longer contain the row
    // by the time we check `selectedId`. FK-cascade means every descendant
    // dies too, so clearing selection only when it matches the exact
    // deleted id leaves stale selection pointing at ghosts. Grow the set
    // by iterating over the flat list until it stops growing (docs cap
    // depth at 12, so this is trivially bounded).
    const doomed = new Set<number>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of todos) {
        if (n.parentId !== null && doomed.has(n.parentId) && !doomed.has(n.id)) {
          doomed.add(n.id);
          grew = true;
        }
      }
    }
    const ok = await mutations.handleDeleteTodo(rootId);
    if (ok) {
      if (selection.selectedId !== null && doomed.has(selection.selectedId)) {
        selection.setSelectedId(null);
      }
      deleteConfirm.reset();
    }
  }, [deleteConfirm, mutations, selection, todos]);

  return {
    // Data
    todos,
    forest,
    loading,

    // Mutation state
    isSaving: mutations.isSaving,
    isDeleting: mutations.isDeleting,
    error: mutations.error,
    clearError: mutations.clearError,

    // Filters
    searchQuery: filters.searchQuery,
    setSearchQuery: filters.setSearchQuery,
    showDone: filters.showDone,
    setShowDone: filters.setShowDone,
    selectedTagName: filters.selectedTagName,
    setSelectedTagName: filters.setSelectedTagName,
    dueFilter: filters.dueFilter,
    setDueFilter: filters.setDueFilter,
    tagFilterOptions: filters.tagFilterOptions,
    clearFilters: filters.clearFilters,

    // Selection & detail pane
    selectedId: selection.selectedId,
    setSelectedId: selection.setSelectedId,
    detail: selection.detail,
    detailLoading: selection.detailLoading,

    // Mutation entry points
    handleCreateTodo: mutations.handleCreateTodo,
    handleUpdateTodo: mutations.handleUpdateTodo,
    handleMoveTodo: mutations.handleMoveTodo,
    handleReorderSiblings: mutations.handleReorderSiblings,
    handleDeleteTodo: mutations.handleDeleteTodo,

    // Delete-confirm dialog
    isDeleteConfirmOpen: deleteConfirm.isDeleteConfirmOpen,
    todoToDelete: deleteConfirm.todoToDelete,
    confirmDelete: deleteConfirm.confirmDelete,
    cancelDelete: deleteConfirm.cancelDelete,
    executeDelete,

    // Data actions
    refreshTodos,

    // DnD adapter
    onArboristMove: dnd.onArboristMove,
  };
}
