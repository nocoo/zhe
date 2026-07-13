"use client";

/**
 * Tree shell wrapper — the react-arborist boundary in one place. Keeping
 * the arborist prop plumbing here means the page can swap tree libraries
 * later without shredding the row template (see docs "Backup:
 * @headless-tree/react").
 *
 * Arborist is fully controlled: `data` is the derived forest, `onMove`
 * routes through the DnD adapter, and selection is mirrored by the parent
 * VM. `rowHeight` is fixed so the built-in virtualiser works.
 */

import { useCallback, useRef } from "react";
import { Tree, type NodeRendererProps, type TreeApi } from "react-arborist";
import type { TodoForestNode } from "@/models/todos";
import { TodoTreeRow } from "./todo-tree-row";

export interface TodoTreeShellProps {
  data: TodoForestNode[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onArboristMove: (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) => Promise<void>;
  onToggleDone: (id: number, done: boolean) => void;
  onRename: (id: number, title: string) => void;
  onAddChild: (parentId: number) => void;
  onAddSibling: (siblingId: number, parentId: number | null) => void;
  onConfirmDelete: (node: TodoForestNode) => void;
  /** Selects the row so the detail-pane emoji picker becomes visible. */
  onEditEmoji: (id: number) => void;
  /**
   * When true, arborist's drag-and-drop is disabled entirely — used on
   * touch pointers per docs/21-todos-feature.md so nesting/reorder gestures
   * on unreliable inputs never fire an accidental server move; everything
   * else (add, edit, check, delete, tag, due) still works.
   */
  disableDrag?: boolean;
  /** Height of the tree viewport in px. Defaults to 640. */
  height?: number;
}

export function TodoTreeShell({
  data,
  selectedId,
  onSelect,
  onArboristMove,
  onToggleDone,
  onRename,
  onAddChild,
  onAddSibling,
  onConfirmDelete,
  onEditEmoji,
  disableDrag = false,
  height = 640,
}: TodoTreeShellProps) {
  const treeRef = useRef<TreeApi<TodoForestNode> | undefined>(undefined);

  // Adapter for arborist's NodeRenderer contract — bind the VM callbacks
  // via closure so the row component signature stays pure props.
  const RowRenderer = useCallback(
    (props: NodeRendererProps<TodoForestNode>) => (
      <TodoTreeRow
        {...props}
        selectedId={selectedId}
        onSelect={onSelect}
        onToggleDone={onToggleDone}
        onRename={onRename}
        onAddChild={onAddChild}
        onAddSibling={onAddSibling}
        onConfirmDelete={onConfirmDelete}
        onEditEmoji={onEditEmoji}
      />
    ),
    [
      selectedId,
      onSelect,
      onToggleDone,
      onRename,
      onAddChild,
      onAddSibling,
      onConfirmDelete,
      onEditEmoji,
    ],
  );

  return (
    <div className="flex-1 min-h-0 py-2 px-1" data-todo-tree>
      <Tree<TodoForestNode>
        ref={treeRef}
        data={data}
        idAccessor={(t) => String(t.id)}
        childrenAccessor={(t) => (t.children.length > 0 ? t.children : null)}
        onMove={async ({ dragIds, parentId, index }) => {
          await onArboristMove({ dragIds, parentId, index });
        }}
        rowHeight={34}
        indent={18}
        width="100%"
        height={height}
        openByDefault
        // Always pass a string so the props key set stays stable across
        // renders. arborist's <Provider> uses `Object.values(treeProps)`
        // as a useMemo dep array — a conditional spread makes the array
        // length flip between renders and React aborts with "The final
        // argument passed to useMemo changed size between renders." An
        // empty string is arborist's own "no selection" signal (the
        // provider only calls select() when the value is truthy).
        selection={selectedId !== null ? String(selectedId) : ""}
        // Multi-select interferes with tree-scoped selection semantics
        // (right-pane detail is single-todo); disable it for now.
        disableMultiSelection
        // On touch pointers the docs disable arborist DnD entirely — the
        // 3-dot menu (Add child / Add sibling) still lets users nest by
        // choice, so no reparent affordance is lost.
        disableDrag={disableDrag}
        disableDrop={disableDrag}
        className="text-sm"
      >
        {RowRenderer}
      </Tree>
    </div>
  );
}
