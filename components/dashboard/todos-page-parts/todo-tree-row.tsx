"use client";

/**
 * A single row inside the todo tree — rendered by react-arborist's node
 * renderer contract. The row owns:
 *
 *   - the chevron (expand / collapse for internal nodes)
 *   - the done checkbox (mutation goes through the VM's optimistic
 *     handleUpdateTodo, so the tree updates instantly)
 *   - the inline-editable title (arborist's built-in edit mode is
 *     wired via `node.isEditing`; we commit through the VM on submit)
 *   - the tag chips (via TodoTagChip primitive, C10)
 *   - the due chip (via TodoDueChip primitive, C10)
 *   - a hover 3-dot menu with Add child / Add sibling / Delete…
 *
 * Everything shape-related lives here so a future move to
 * `@headless-tree/react` (see docs "Backup") only has to reshuffle the
 * shell wrapper, not the row.
 */

import { memo, useCallback, useState, type MouseEvent, type KeyboardEvent } from "react";
import type { NodeApi, NodeRendererProps } from "react-arborist";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TodoTagChip } from "@/components/dashboard/todo-tag-chip";
import { TodoDueChip } from "@/components/dashboard/todo-due-chip";
import type { TodoForestNode } from "@/models/todos";

export interface TodoTreeRowProps extends NodeRendererProps<TodoForestNode> {
  /** Selected id from the composition viewmodel; drives the row highlight. */
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Toggle a todo's done flag; optimistic update runs at the VM layer. */
  onToggleDone: (id: number, done: boolean) => void;
  /** Rename commit; empty strings are rejected in the VM's title check. */
  onRename: (id: number, title: string) => void;
  /** Menu actions — the composition VM assembles the input. */
  onAddChild: (parentId: number) => void;
  onAddSibling: (siblingId: number, parentId: number | null) => void;
  onConfirmDelete: (node: TodoForestNode) => void;
}

export const TodoTreeRow = memo(function TodoTreeRow({
  node,
  style,
  dragHandle,
  selectedId,
  onSelect,
  onToggleDone,
  onRename,
  onAddChild,
  onAddSibling,
  onConfirmDelete,
}: TodoTreeRowProps) {
  const todo = node.data;
  const isSelected = selectedId === todo.id;

  const onRowClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // Guard against bubbled clicks from the interactive children
      // (chevron / checkbox / menu button / chips). Those handlers already
      // stop propagation, but this second-line defence keeps a bug in one
      // of them from firing an accidental selection change.
      if ((e.target as HTMLElement).closest("[data-todo-row-guard]")) return;
      onSelect(todo.id);
    },
    [todo.id, onSelect],
  );

  const onRowKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Enter/Space on the row surface should activate selection to match
      // a real button. The nested interactive children have their own key
      // handling — we only run when the row itself is focused.
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(todo.id);
      }
    },
    [todo.id, onSelect],
  );

  return (
    <div
      ref={dragHandle}
      style={style}
      onClick={onRowClick}
      onKeyDown={onRowKeyDown}
      role="treeitem"
      tabIndex={0}
      aria-selected={isSelected}
      aria-expanded={node.isInternal ? node.isOpen : undefined}
      className={cn(
        "group flex h-full items-center gap-1 pr-2 text-sm select-none cursor-pointer",
        isSelected ? "bg-accent/60" : "hover:bg-accent/30",
        todo.done && "opacity-60",
      )}
      data-todo-row={todo.id}
    >
      {node.isInternal ? (
        <button
          type="button"
          data-todo-row-guard
          onClick={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
          aria-label={node.isOpen ? "Collapse" : "Expand"}
          className="p-1 rounded-sm hover:bg-accent/60 focus:outline-hidden focus:ring-1 focus:ring-ring"
        >
          {node.isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      ) : (
        <span className="w-6" aria-hidden />
      )}

      <input
        type="checkbox"
        checked={todo.done}
        data-todo-row-guard
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggleDone(todo.id, e.target.checked)}
        aria-label={`Mark ${todo.title} ${todo.done ? "not done" : "done"}`}
        className="h-3.5 w-3.5 cursor-pointer"
      />

      {node.isEditing ? (
        <TitleEditor
          initialValue={todo.title}
          onSubmit={(next) => {
            const trimmed = next.trim();
            if (trimmed.length > 0 && trimmed !== todo.title) {
              onRename(todo.id, trimmed);
            }
            node.reset();
          }}
          onCancel={() => node.reset()}
        />
      ) : (
        <button
          type="button"
          data-todo-row-guard
          onDoubleClick={(e) => {
            e.stopPropagation();
            node.edit();
          }}
          onClick={(e) => {
            // Single click on the label still selects the row — we defer
            // to the row-level onClick so the guard-check semantics stay
            // consistent for keyboard/mouse.
            e.stopPropagation();
            onSelect(todo.id);
          }}
          className={cn(
            "min-w-0 truncate rounded-sm bg-transparent border-0 px-1 py-0.5 text-left font-inherit",
            todo.done && "line-through",
          )}
          title={todo.title}
        >
          {todo.title || <span className="italic opacity-60">Untitled</span>}
        </button>
      )}

      <span className="ml-auto flex items-center gap-1" data-todo-row-guard>
        {todo.hasContent ? (
          <FileText
            className="h-3 w-3 text-muted-foreground"
            aria-label="Has notes"
          />
        ) : null}
        {todo.tagNames.slice(0, 3).map((name) => (
          <TodoTagChip key={name} name={name} />
        ))}
        {todo.tagNames.length > 3 ? (
          <span
            className="text-[10px] text-muted-foreground"
            title={todo.tagNames.slice(3).join(", ")}
          >
            +{todo.tagNames.length - 3}
          </span>
        ) : null}
        <TodoDueChip dueAt={todo.dueAt} done={todo.done} />

        <RowMenu
          node={node}
          onAddChild={onAddChild}
          onAddSibling={onAddSibling}
          onConfirmDelete={onConfirmDelete}
        />
      </span>
    </div>
  );
});

function TitleEditor({
  initialValue,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  // Take focus imperatively on mount instead of `autoFocus` — the ESLint
  // rule bans autoFocus on general form controls, but arborist's inline
  // edit mode is a well-established pattern where the user *did* invoke
  // the editor and expects focus to jump.
  const inputRef = useCallback((el: HTMLInputElement | null) => {
    if (el) el.focus();
  }, []);
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSubmit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSubmit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1 py-0.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-ring"
      data-todo-row-guard
    />
  );
}

function RowMenu({
  node,
  onAddChild,
  onAddSibling,
  onConfirmDelete,
}: {
  node: NodeApi<TodoForestNode>;
  onAddChild: (parentId: number) => void;
  onAddSibling: (siblingId: number, parentId: number | null) => void;
  onConfirmDelete: (node: TodoForestNode) => void;
}) {
  const todo = node.data;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => e.stopPropagation()}
          className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Row menu for ${todo.title}`}
          data-todo-row-guard
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAddChild(todo.id)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> Add child
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAddSibling(todo.id, todo.parentId)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> Add sibling
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onConfirmDelete(todo)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
