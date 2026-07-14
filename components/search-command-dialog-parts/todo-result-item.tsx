"use client";

import { ListTodo } from "lucide-react";
import { TodoDueChip } from "@/components/dashboard/todo-due-chip";
import { TodoTagChip } from "@/components/dashboard/todo-tag-chip";
import { CommandItem } from "@/components/ui/command";
import type { TodoTreeNode } from "@/lib/db/scoped";
import { highlightMatches } from "@/models/links";
import { HighlightText } from "./highlight-text";

interface TodoResultItemProps {
  todo: TodoTreeNode;
  trimmedQuery: string;
  /** Reference "now" for the due chip; injected for testability. */
  now?: Date;
  onNavigate: (todoId: number) => void;
}

export function TodoResultItem({ todo, trimmedQuery, now, onNavigate }: TodoResultItemProps) {
  const displayTitle = todo.title.length > 0 ? todo.title : "Untitled";

  return (
    <CommandItem
      key={`todo-${todo.id}`}
      value={`todo-${todo.id}`}
      className="flex items-start gap-2.5 py-2"
      onSelect={() => onNavigate(todo.id)}
    >
      <div className="mt-0.5 shrink-0">
        <div className="w-3.5 h-3.5 rounded-[3px] bg-accent flex items-center justify-center">
          <ListTodo className="w-2 h-2 text-muted-foreground/60" strokeWidth={2} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={
            "truncate text-sm font-medium leading-tight" +
            (todo.done ? " line-through text-muted-foreground/70" : "")
          }
        >
          <HighlightText segments={highlightMatches(displayTitle, trimmedQuery)} />
        </p>
        {todo.excerpt ? (
          <p className="truncate text-xs text-muted-foreground/70 mt-0.5 leading-tight">
            <HighlightText segments={highlightMatches(todo.excerpt, trimmedQuery)} />
          </p>
        ) : null}
        {(todo.tagNames.length > 0 || todo.dueAt !== null) && (
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground leading-none flex-wrap">
            {todo.tagNames.slice(0, 3).map((name) => (
              <TodoTagChip key={name} name={name} />
            ))}
            {todo.tagNames.length > 3 ? (
              <span className="text-[10px] text-muted-foreground/70">
                +{todo.tagNames.length - 3}
              </span>
            ) : null}
            <TodoDueChip dueAt={todo.dueAt} done={todo.done} {...(now ? { now } : {})} />
          </div>
        )}
      </div>
    </CommandItem>
  );
}
