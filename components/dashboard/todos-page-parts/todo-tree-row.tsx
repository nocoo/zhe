"use client";

/**
 * A single row inside the todo tree — rendered by react-arborist's node
 * renderer contract. The row owns:
 *
 *   - the chevron (expand / collapse for internal nodes)
 *   - the done checkbox (mutation goes through the VM's optimistic
 *     handleUpdateTodo, so the tree updates instantly)
 *   - the emoji glyph (read-only here; editing goes through the detail
 *     pane's picker so the row stays keyboard-clean)
 *   - the inline-editable title (arborist's built-in edit mode is
 *     wired via `node.isEditing`; we commit through the VM on submit)
 *   - the tag chips (via TodoTagChip primitive)
 *   - the due chip (via TodoDueChip primitive)
 *   - a hover 3-dot menu with Add child / Add sibling / Change emoji /
 *     Delete…, plus the same options via right-click context menu
 *   - keyboard shortcuts: Enter (edit title), Space (toggle done),
 *     Delete/Backspace (open delete-confirm), Cmd/Ctrl+N (add sibling)
 *
 * Everything shape-related lives here so a future move to
 * `@headless-tree/react` (see docs "Backup") only has to reshuffle the
 * shell wrapper, not the row.
 */

import {
  memo,
  useCallback,
  useState,
  type ComponentType,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import type { NodeApi, NodeRendererProps } from "react-arborist";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Plus,
  Smile,
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  /** Pop the detail pane's emoji picker for this row. */
  onEditEmoji: (id: number) => void;
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
  onEditEmoji,
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
      // Only react when the row itself owns focus — nested inputs manage
      // their own keys (e.g. TitleEditor Enter/Esc). react-arborist's
      // default container binds Arrow/Tab/etc. at a higher level.
      if (e.target !== e.currentTarget) return;
      if (node.isEditing) return;

      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        onAddSibling(todo.id, todo.parentId);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        node.edit();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        onToggleDone(todo.id, !todo.done);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onConfirmDelete(todo);
        return;
      }
    },
    [node, todo, onAddSibling, onToggleDone, onConfirmDelete],
  );

  const rowContent = (
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
        "group flex h-full items-center gap-1.5 mx-1 pr-2 text-sm select-none cursor-pointer rounded-widget transition-colors",
        isSelected
          ? "bg-accent/80 text-foreground"
          : "hover:bg-accent/40",
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
          className="p-1 rounded-md hover:bg-accent/60 focus:outline-hidden focus:ring-1 focus:ring-ring"
        >
          {node.isOpen ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
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
        className="h-4 w-4 cursor-pointer"
      />

      {todo.emoji ? (
        <span
          className="text-base leading-none select-none"
          aria-label={`Emoji ${todo.emoji}`}
        >
          {todo.emoji}
        </span>
      ) : null}

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
            "min-w-0 truncate rounded-sm bg-transparent border-0 px-1 py-0.5 text-left text-sm font-inherit",
            todo.done && "line-through",
          )}
          title={todo.title}
        >
          {todo.title || <span className="italic opacity-60">未命名</span>}
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
          onEditEmoji={onEditEmoji}
          onConfirmDelete={onConfirmDelete}
        />
      </span>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
      <ContextMenuContent
        onClick={(e) => e.stopPropagation()}
        // Focus the row when the context menu opens so keyboard follow-up
        // (Delete, Space, etc.) targets the right row.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <RowMenuItems
          todo={todo}
          onAddChild={onAddChild}
          onAddSibling={onAddSibling}
          onEditEmoji={onEditEmoji}
          onConfirmDelete={onConfirmDelete}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
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

interface RowMenuItemsProps {
  todo: TodoForestNode;
  onAddChild: (parentId: number) => void;
  onAddSibling: (siblingId: number, parentId: number | null) => void;
  onEditEmoji: (id: number) => void;
  onConfirmDelete: (node: TodoForestNode) => void;
  /** Menu-item component: DropdownMenuItem or ContextMenuItem. */
  Item: ComponentType<{
    onSelect?: (event: Event) => void;
    className?: string;
    children?: React.ReactNode;
  }>;
  /** Separator component matching Item. */
  Separator: ComponentType<Record<string, never>>;
}

/**
 * Shared menu-item block rendered under either DropdownMenu or ContextMenu.
 * Kept in one place so the 3-dot dropdown and right-click menu never drift
 * apart. Both wrapper components accept the same Radix `onSelect` signature.
 */
function RowMenuItems({
  todo,
  onAddChild,
  onAddSibling,
  onEditEmoji,
  onConfirmDelete,
  Item,
  Separator,
}: RowMenuItemsProps) {
  return (
    <>
      <Item onSelect={() => onAddChild(todo.id)}>
        <Plus className="mr-2 h-3.5 w-3.5" /> 添加子项
      </Item>
      <Item onSelect={() => onAddSibling(todo.id, todo.parentId)}>
        <Plus className="mr-2 h-3.5 w-3.5" /> 添加同级
      </Item>
      <Item onSelect={() => onEditEmoji(todo.id)}>
        <Smile className="mr-2 h-3.5 w-3.5" /> 修改 emoji
      </Item>
      <Separator />
      <Item
        onSelect={() => onConfirmDelete(todo)}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-3.5 w-3.5" /> 删除…
      </Item>
    </>
  );
}

function RowMenu({
  node,
  onAddChild,
  onAddSibling,
  onEditEmoji,
  onConfirmDelete,
}: {
  node: NodeApi<TodoForestNode>;
  onAddChild: (parentId: number) => void;
  onAddSibling: (siblingId: number, parentId: number | null) => void;
  onEditEmoji: (id: number) => void;
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
        <RowMenuItems
          todo={todo}
          onAddChild={onAddChild}
          onAddSibling={onAddSibling}
          onEditEmoji={onEditEmoji}
          onConfirmDelete={onConfirmDelete}
          Item={DropdownMenuItem}
          Separator={DropdownMenuSeparator}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
