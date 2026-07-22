"use client";

/**
 * Right pane for the selected todo:
 *   • Title editor (Enter/blur commits)
 *   • Due row (native <input type="date"> + Clear button — v1 date-only)
 *   • Tag row (chips + free-text add)
 *   • Content editor (textarea View → markdown-preview render on toggle)
 *
 * Every mutation goes through the composition VM's `handleUpdateTodo`,
 * so optimistic UX and rollback come for free.
 *
 * Density: inline fields use compact (`sm`) controls; the title row is a
 * single h-8 baseline so the emoji trigger and title input share one line.
 */

import { useEffect, useMemo, useState } from "react";
import { TodoDueChip } from "@/components/dashboard/todo-due-chip";
import { TodoTagChip } from "@/components/dashboard/todo-tag-chip";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TodoDetail } from "@/lib/db/scoped";
import { cn } from "@/lib/utils";
import { TodoEmojiPicker } from "./todo-emoji-picker";

/** Loose input shape matching the server action's UpdateTodoActionInput. */
interface UpdateInput {
  title?: string;
  content?: string | null;
  done?: boolean;
  dueAtMs?: number | null;
  tagNames?: string[];
  emoji?: string | null;
}

export interface TodoDetailPaneProps {
  detail: TodoDetail | null;
  detailLoading: boolean;
  onUpdate: (id: number, patch: UpdateInput) => Promise<unknown>;
}

/**
 * Convert a Date (stored dueAt) to an `<input type=date>` value.
 * The value is always the local calendar-day part of the stored instant.
 */
function toDateInputValue(due: Date | null): string {
  if (!due) return "";
  const y = due.getFullYear();
  const m = String(due.getMonth() + 1).padStart(2, "0");
  const d = String(due.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Turn a `<input type=date>` value ("YYYY-MM-DD") into the epoch ms
 * matching local end-of-day, mirroring the storage semantic from
 * docs/21-todos-feature.md — "Due Date".
 */
function dateInputValueToMs(value: string): number | null {
  if (!value) return null;
  const [ys, ms, ds] = value.split("-");
  if (!ys || !ms || !ds) return null;
  const y = Number(ys);
  const m = Number(ms) - 1;
  const d = Number(ds);
  if ([y, m, d].some((n) => Number.isNaN(n))) return null;
  return new Date(y, m, d, 23, 59, 59, 999).getTime();
}

export function TodoDetailPane({ detail, detailLoading, onUpdate }: TodoDetailPaneProps) {
  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {detailLoading ? "加载中…" : "选择一条待办查看详情"}
      </div>
    );
  }
  // The pane is keyed on `detail.id` by the parent, so we get a fresh
  // component per selection and don't need to reset local state on id
  // changes here.
  return <TodoDetailPaneBody detail={detail} onUpdate={onUpdate} />;
}

function TodoDetailPaneBody({
  detail,
  onUpdate,
}: {
  detail: TodoDetail;
  onUpdate: (id: number, patch: UpdateInput) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(detail.title);
  const [contentDraft, setContentDraft] = useState(detail.content ?? "");
  const [contentMode, setContentMode] = useState<"view" | "edit">(detail.content ? "view" : "edit");
  const [tagDraft, setTagDraft] = useState("");
  const [dueInputValue, setDueInputValue] = useState(toDateInputValue(detail.dueAt));

  // Re-sync when the server truth changes (e.g. after another window
  // updated the row and a refresh landed).
  useEffect(() => {
    setTitle(detail.title);
  }, [detail.title]);
  useEffect(() => {
    setContentDraft(detail.content ?? "");
  }, [detail.content]);
  useEffect(() => {
    setDueInputValue(toDateInputValue(detail.dueAt));
  }, [detail.dueAt]);

  const tagNames = detail.tagNames;

  const commitTitle = () => {
    const trimmed = title.trim();
    // Empty title is invalid at the ScopedDB layer (title.notNull + trim
    // + emptiness guard). Bounce local state back to server truth so the
    // pane never displays a title that couldn't actually be saved.
    if (trimmed === "") {
      setTitle(detail.title);
      return;
    }
    if (trimmed === detail.title) {
      // Normalise stray whitespace to the trimmed form so a subsequent
      // blur with no changes doesn't refire this.
      if (title !== trimmed) setTitle(trimmed);
      return;
    }
    void onUpdate(detail.id, { title: trimmed });
  };
  const commitContent = () => {
    const next = contentDraft;
    if (next === (detail.content ?? "")) return;
    void onUpdate(detail.id, { content: next.length === 0 ? null : next });
  };
  const addTag = () => {
    const canonical = tagDraft.trim().toLowerCase();
    if (canonical.length === 0) return;
    if (tagNames.includes(canonical)) {
      setTagDraft("");
      return;
    }
    void onUpdate(detail.id, { tagNames: [...tagNames, canonical] });
    setTagDraft("");
  };
  const removeTag = (name: string) => {
    void onUpdate(detail.id, { tagNames: tagNames.filter((n) => n !== name) });
  };
  const commitDue = (raw: string) => {
    const nextMs = dateInputValueToMs(raw);
    const currentMs = detail.dueAt ? detail.dueAt.getTime() : null;
    if (nextMs === currentMs) return;
    void onUpdate(detail.id, { dueAtMs: nextMs });
  };
  const clearDue = () => {
    setDueInputValue("");
    if (detail.dueAt === null) return;
    void onUpdate(detail.id, { dueAtMs: null });
  };

  const meta = useMemo(
    () =>
      `创建于 ${detail.createdAt.toLocaleString("zh-CN")} · 更新于 ${detail.updatedAt.toLocaleString("zh-CN")}`,
    [detail.createdAt, detail.updatedAt],
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-2" data-detail-title-row>
        <TodoEmojiPicker
          value={detail.emoji}
          onChange={(next) => {
            void onUpdate(detail.id, { emoji: next });
          }}
        />
        <Input
          size="sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
            }
          }}
          aria-label="Todo title"
          className={cn(
            "h-8 flex-1 border-transparent bg-transparent px-1 text-base font-medium shadow-none",
            "hover:border-border/60 focus-visible:border-ring focus-visible:bg-secondary focus-visible:shadow-xs",
          )}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs" data-detail-due-row>
        <span className="text-muted-foreground">截止</span>
        <Input
          type="date"
          size="sm"
          value={dueInputValue}
          onChange={(e) => setDueInputValue(e.target.value)}
          onBlur={() => commitDue(dueInputValue)}
          className="w-40"
          aria-label="Due date"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearDue}
          disabled={detail.dueAt === null && dueInputValue === ""}
        >
          清除
        </Button>
        <TodoDueChip dueAt={detail.dueAt} done={detail.done} />
      </div>

      <div className="flex flex-wrap items-center gap-1" data-detail-tag-row>
        {tagNames.map((name) => (
          <TodoTagChip key={name} name={name} onRemove={() => removeTag(name)} />
        ))}
        <Input
          size="sm"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="添加标签…"
          aria-label="Add tag"
          className="h-6 min-w-[6rem] w-auto px-2"
        />
      </div>

      <div className="flex-1 min-h-[10rem]" data-detail-content-region>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>备注</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setContentMode((m) => (m === "view" ? "edit" : "view"))}
          >
            {contentMode === "view" ? "编辑" : "预览"}
          </Button>
        </div>
        {contentMode === "edit" ? (
          <Textarea
            value={contentDraft}
            onChange={(e) => setContentDraft(e.target.value)}
            onBlur={commitContent}
            placeholder="支持 Markdown 备注…"
            className="min-h-[10rem] rounded-widget text-sm"
            aria-label="Todo notes"
          />
        ) : (
          // Markdown may render <a> / task-list <input>, so this cannot be a
          // <button> (invalid nested interactives / hydration). Primary edit
          // entry is the header toggle; double-click is a mouse convenience.
          // biome-ignore lint/a11y/noStaticElementInteractions: double-click affordance only; header 编辑 is the accessible control
          <div
            onDoubleClick={() => setContentMode("edit")}
            className="min-h-[10rem] w-full cursor-text rounded-widget border border-transparent p-2 text-left hover:border-border/60"
          >
            <MarkdownPreview content={contentDraft} placeholder="暂无备注，双击进入编辑。" />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{meta}</p>
    </div>
  );
}
