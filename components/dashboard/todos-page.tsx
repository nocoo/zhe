"use client";

/**
 * Two-pane todos workspace:
 *   left = tree (with filters at the bottom)
 *   right = detail pane for the selected todo
 *
 * The composition mounts `useTodosViewModel` once and passes callbacks
 * down; every mutation flows through the VM's optimistic / rollback
 * layer. This file intentionally does not touch:
 *   - the sidebar nav (that's C13)
 *   - global search (C14)
 *   - narrow-viewport `Sheet` fallback (C12)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useCoarsePointer,
  useNarrowViewport,
} from "@/hooks/use-media-query";
import { useTodosViewModel } from "@/viewmodels/useTodosViewModel";
import { TodoTreeShell } from "./todos-page-parts/todo-tree-shell";
import { TodoDetailPane } from "./todos-page-parts/todo-detail-pane";
import { TodosFilterBar } from "./todos-page-parts/todos-filter-bar";
import { TodoDeleteConfirm } from "./todos-page-parts/todo-delete-confirm";
import type { TodoForestNode } from "@/models/todos";

/**
 * Count strict descendants of a node in the flat tree — used to display
 * an accurate "delete this + N descendants" message before cascade.
 * Bounded by MAX_TODO_DEPTH so runtime is fine.
 */
function countDescendants(
  todos: readonly { id: number; parentId: number | null }[],
  rootId: number,
): number {
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
  return doomed.size - 1;
}

export function TodosPage() {
  const vm = useTodosViewModel();
  const [createError, setCreateError] = useState<string | null>(null);
  const narrow = useNarrowViewport();
  const coarsePointer = useCoarsePointer();
  const searchParams = useSearchParams();

  // Seed selection from `?id=N` (used by Global Search deep-links).
  //
  // We remember which raw `id=…` value we already applied in `lastAppliedId`
  // so this effect stays a pure function of the query-string. That means:
  //   - If the user manually selects a different row, we don't reset it on
  //     the next render (the raw query string is unchanged).
  //   - If the query string changes to a new id, we apply it exactly once.
  //   - If the user navigates back to the same id later, we honour it.
  // This avoids the eslint-disable / useSearchParams identity hack.
  const idParam = searchParams.get("id");
  const setSelectedId = vm.setSelectedId;
  const lastAppliedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (idParam === null) {
      lastAppliedIdRef.current = null;
      return;
    }
    if (lastAppliedIdRef.current === idParam) return;
    const parsed = Number(idParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      // Record the (invalid) value so we don't retry every render.
      lastAppliedIdRef.current = idParam;
      return;
    }
    lastAppliedIdRef.current = idParam;
    setSelectedId(parsed);
  }, [idParam, setSelectedId]);

  const onCreateRoot = useCallback(async () => {
    setCreateError(null);
    const detail = await vm.handleCreateTodo({ title: "New todo" });
    if (detail) vm.setSelectedId(detail.id);
    else if (vm.error) setCreateError(vm.error);
  }, [vm]);

  const onAddChild = useCallback(
    async (parentId: number) => {
      const detail = await vm.handleCreateTodo({ title: "New todo", parentId });
      if (detail) vm.setSelectedId(detail.id);
    },
    [vm],
  );

  const onAddSibling = useCallback(
    async (_siblingId: number, parentId: number | null) => {
      const detail = await vm.handleCreateTodo({ title: "New todo", parentId });
      if (detail) vm.setSelectedId(detail.id);
    },
    [vm],
  );

  const onToggleDone = useCallback(
    (id: number, done: boolean) => {
      void vm.handleUpdateTodo(id, { done });
    },
    [vm],
  );

  const onRename = useCallback(
    (id: number, title: string) => {
      void vm.handleUpdateTodo(id, { title });
    },
    [vm],
  );

  const descendantCount = useMemo(
    () =>
      vm.todoToDelete
        ? countDescendants(vm.todos, vm.todoToDelete.id)
        : 0,
    [vm.todoToDelete, vm.todos],
  );

  return (
    <div className="flex h-full min-h-[40rem] w-full flex-col" data-todos-page>
      <div className="flex items-center justify-between px-3 py-2">
        <div>
          <h1 className="text-base font-medium">Todos</h1>
          <p className="text-xs text-muted-foreground">
            Hierarchical task lists — drag to reorder or nest.
          </p>
        </div>
        <Button size="sm" onClick={onCreateRoot} disabled={vm.isSaving}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New todo
        </Button>
      </div>

      {vm.error || createError ? (
        <div
          role="alert"
          className="mx-3 mb-2 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {vm.error ?? createError}
          <Button
            size="sm"
            variant="ghost"
            className="ml-2 h-6 text-xs"
            onClick={() => {
              vm.clearError();
              setCreateError(null);
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="flex flex-1 min-h-0 gap-2 px-3 pb-3">
        <section
          className={
            narrow
              ? "flex min-w-0 flex-1 flex-col rounded-md border border-border/60 bg-card"
              : "flex min-w-0 flex-1 flex-col rounded-md border border-border/60 bg-card"
          }
          aria-label="Todos tree"
        >
          {vm.loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Loading todos…
            </div>
          ) : vm.todos.length === 0 ? (
            <EmptyState onCreateRoot={onCreateRoot} />
          ) : (
            <TodoTreeShell
              data={vm.forest as TodoForestNode[]}
              selectedId={vm.selectedId}
              onSelect={vm.setSelectedId}
              onArboristMove={vm.onArboristMove}
              onToggleDone={onToggleDone}
              onRename={onRename}
              onAddChild={onAddChild}
              onAddSibling={onAddSibling}
              onConfirmDelete={vm.confirmDelete}
              disableDrag={coarsePointer}
            />
          )}
          <TodosFilterBar
            searchQuery={vm.searchQuery}
            onSearchQueryChange={vm.setSearchQuery}
            showDone={vm.showDone}
            onShowDoneChange={vm.setShowDone}
            selectedTagName={vm.selectedTagName}
            onSelectedTagNameChange={vm.setSelectedTagName}
            tagFilterOptions={vm.tagFilterOptions}
            dueFilter={vm.dueFilter}
            onDueFilterChange={vm.setDueFilter}
            onClearFilters={vm.clearFilters}
          />
        </section>

        {narrow ? null : (
          <section
            className="flex min-w-0 basis-2/5 flex-col rounded-md border border-border/60 bg-card"
            aria-label="Selected todo detail"
          >
            <TodoDetailPane
              key={vm.detail?.id ?? "empty"}
              detail={vm.detail}
              detailLoading={vm.detailLoading}
              onUpdate={vm.handleUpdateTodo}
            />
          </section>
        )}
      </div>

      {narrow ? (
        <Sheet
          open={vm.selectedId !== null}
          onOpenChange={(open) => {
            if (!open) vm.setSelectedId(null);
          }}
        >
          <SheetContent
            side="right"
            className="w-full sm:max-w-xl p-0 flex flex-col"
            data-todos-detail-sheet
          >
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle className="text-sm">
                {vm.detail?.title ?? "Todo detail"}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 overflow-hidden">
              <TodoDetailPane
                key={vm.detail?.id ?? "empty"}
                detail={vm.detail}
                detailLoading={vm.detailLoading}
                onUpdate={vm.handleUpdateTodo}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <TodoDeleteConfirm
        open={vm.isDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open) vm.cancelDelete();
        }}
        todoTitle={vm.todoToDelete?.title ?? null}
        descendantCount={descendantCount}
        onConfirm={vm.executeDelete}
        isDeleting={vm.isDeleting}
      />
    </div>
  );
}

function EmptyState({ onCreateRoot }: { onCreateRoot: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
      <p>No todos yet. Start with a root task.</p>
      <Button size="sm" variant="secondary" onClick={onCreateRoot}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Create root
      </Button>
    </div>
  );
}
