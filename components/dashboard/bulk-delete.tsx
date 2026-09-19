"use client";

import { ListChecks, Trash2, X } from "lucide-react";
import { type ComponentPropsWithoutRef, type Ref, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { BulkDeleteState } from "@/viewmodels/useBulkDelete";

export function BulkDeleteActions({ selection }: { selection: BulkDeleteState }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const floatingTrigger = useRef<HTMLButtonElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    setOffscreen(false);
    if (!selection.active || !toolbar.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setOffscreen(!entry.isIntersecting);
    });
    observer.observe(toolbar.current);
    return () => observer.disconnect();
  }, [selection.active]);

  return (
    <>
      <div ref={toolbar} className="flex min-w-0">
        {selection.active ? (
          <SelectionControls selection={selection} deleteRef={trigger} />
        ) : (
          <Button
            ref={trigger}
            size="sm"
            className="w-8 shrink-0 px-0"
            variant="outline"
            aria-label="多选卡片"
            title="多选卡片"
            onClick={selection.enter}
            disabled={!selection.total}
          >
            <ListChecks aria-hidden />
          </Button>
        )}
      </div>
      {selection.active &&
        offscreen &&
        createPortal(
          <SelectionControls selection={selection} deleteRef={floatingTrigger} floating />,
          document.body,
        )}
      <BulkDeleteDialog
        selection={selection}
        onRestoreFocus={() =>
          (floatingTrigger.current ?? trigger.current)?.focus({ preventScroll: true })
        }
      />
    </>
  );
}

function SelectionControls({
  selection,
  deleteRef,
  floating = false,
}: {
  selection: BulkDeleteState;
  deleteRef: Ref<HTMLButtonElement>;
  floating?: boolean;
}) {
  const allSelected = selection.count === selection.total && selection.total > 0;
  return (
    <fieldset
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-end gap-2",
        floating &&
          "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 justify-center rounded-card border border-border bg-popover p-2 text-popover-foreground shadow-lg",
      )}
      aria-label={floating ? "浮动多选操作" : "多选操作"}
    >
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground" role="status">
        已选 {selection.count} 项
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={selection.selectAll}
        disabled={!selection.total}
        aria-label={allSelected ? "取消全选" : "全选当前列表"}
      >
        {allSelected ? "取消全选" : floating ? "全选" : "全选当前列表"}
      </Button>
      <Button
        ref={deleteRef}
        size="sm"
        variant="destructive"
        disabled={!selection.count}
        onClick={selection.requestDelete}
        aria-label="删除所选"
      >
        <Trash2 aria-hidden />
        {floating ? "删除" : "删除所选"}
      </Button>
      <Button
        size="sm"
        className="w-8 shrink-0 px-0"
        variant="ghost"
        aria-label="退出多选"
        onClick={selection.exit}
      >
        <X aria-hidden />
      </Button>
    </fieldset>
  );
}

export function SelectableCard({
  selection,
  itemId,
  label,
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  selection: BulkDeleteState;
  itemId: number;
  label: string;
}) {
  const id = useId();
  const checked = selection.selected.has(itemId);
  return (
    <div
      {...props}
      className={cn(
        "relative rounded-card",
        selection.active && checked && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        className,
      )}
      data-selected={selection.active ? checked : undefined}
    >
      <div inert={selection.active} className="h-full">
        {children}
      </div>
      {selection.active && (
        <label
          htmlFor={id}
          className="absolute inset-0 z-10 cursor-pointer rounded-card has-focus-visible:ring-2 has-focus-visible:ring-ring"
        >
          <span className="absolute -left-1.5 -top-1.5 flex rounded-widget bg-card p-1.5 shadow-sm ring-1 ring-border">
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={() => selection.toggle(itemId)}
              aria-label={`选择 ${label}`}
            />
          </span>
        </label>
      )}
    </div>
  );
}

function BulkDeleteDialog({
  selection,
  onRestoreFocus,
}: {
  selection: BulkDeleteState;
  onRestoreFocus: () => void;
}) {
  const batch = selection.batch;
  const running = batch?.phase === "running";
  const done = batch?.phase === "done";
  return (
    <AlertDialog
      open={!!batch}
      onOpenChange={(open) => {
        if (!open) selection.close();
      }}
    >
      <AlertDialogContent
        size="base"
        onEscapeKeyDown={(event) => {
          if (running) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg leading-6">
            {running ? "正在删除" : done ? "删除结果" : `删除 ${batch?.items.length ?? 0} 项内容？`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-5">
            {running
              ? "正在逐项删除并清理关联文件，请保持页面打开。"
              : done
                ? "本次批量处理已结束。"
                : "所选内容及关联文件将被删除，此操作无法撤销。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {batch?.phase === "confirm" && (
          <ul className="max-h-48 space-y-2 overflow-y-auto text-sm" aria-label="待删除内容">
            {batch.items.map((item) => (
              <li key={item.id} className="truncate" title={item.label}>
                {item.label}
              </li>
            ))}
          </ul>
        )}
        {batch && (running || done) && (
          <div className="space-y-3">
            <progress
              aria-label="删除进度"
              max={batch.items.length}
              value={batch.processed}
              className="block h-2 w-full appearance-none overflow-hidden rounded-full bg-primary/10 [&::-webkit-progress-bar]:bg-primary/10 [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
            />
            <div
              className="flex items-center justify-between gap-3 text-sm"
              role="status"
              aria-live="polite"
            >
              <span>
                {done
                  ? `已删除 ${batch.processed - batch.failures.length} 项${batch.failures.length ? `，失败 ${batch.failures.length} 项` : ""}`
                  : "处理中"}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {batch.processed} / {batch.items.length}
              </span>
            </div>
            {running && (
              <p className="truncate text-xs text-muted-foreground">
                {batch.items[batch.processed]?.label}
              </p>
            )}
            {done && batch.failures.length > 0 && (
              <ul
                className="max-h-48 space-y-2 overflow-y-auto text-sm"
                aria-label="删除失败的内容"
              >
                {batch.failures.map((item) => (
                  <li key={item.id}>
                    <p className="truncate font-medium">{item.label}</p>
                    <p className="text-xs text-destructive">{item.error}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <AlertDialogFooter className="mt-2 flex-row justify-end">
          <Button size="lg" variant="outline" disabled={running} onClick={selection.close}>
            {done ? "关闭" : "取消"}
          </Button>
          {!done ? (
            <Button
              size="lg"
              variant="destructive"
              loading={running}
              onClick={() => void selection.execute()}
            >
              {running ? "删除中…" : "确认删除"}
            </Button>
          ) : batch?.failures.length ? (
            <Button size="lg" onClick={() => void selection.execute()}>
              重试失败项
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
