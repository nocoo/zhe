"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nocoo/basalt/components/alert-dialog";
import { Button } from "@nocoo/basalt/components/button";
import { Checkbox } from "@nocoo/basalt/components/checkbox";
import { ListChecks, ListX, Trash2, X } from "@nocoo/basalt/icons";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { BulkDeleteState } from "@/viewmodels/useBulkDelete";
import { IconAction } from "./icon-action";

export function BulkDeleteActions({
  selection,
  bottom = false,
  actions,
  pending = false,
}: {
  selection: BulkDeleteState;
  bottom?: boolean;
  actions?: ReactNode;
  pending?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const floatingTrigger = useRef<HTMLButtonElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = useState(false);
  const wasSelecting = useRef(selection.active);

  useEffect(() => {
    if (wasSelecting.current && !selection.active) trigger.current?.focus({ preventScroll: true });
    wasSelecting.current = selection.active;
  }, [selection.active]);

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
          bottom ? null : (
            <SelectionControls selection={selection} deleteRef={trigger} />
          )
        ) : (
          <IconAction
            ref={trigger}
            density="toolbar"
            label="多选卡片"
            onClick={selection.enter}
            disabled={!selection.total}
          >
            <ListChecks aria-hidden />
          </IconAction>
        )}
      </div>
      {selection.active &&
        (bottom || offscreen) &&
        createPortal(
          <SelectionControls
            selection={selection}
            deleteRef={floatingTrigger}
            floating
            actions={actions}
            pending={pending}
          />,
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
  actions,
  pending = false,
}: {
  selection: BulkDeleteState;
  deleteRef: Ref<HTMLButtonElement>;
  floating?: boolean;
  actions?: ReactNode;
  pending?: boolean;
}) {
  const allSelected = selection.count === selection.total && selection.total > 0;
  return (
    <fieldset
      data-floating-selection={floating ? "" : undefined}
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-end gap-2",
        floating &&
          "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 justify-center rounded-basalt-card border border-basalt-border bg-basalt-popover p-2 text-basalt-popover-foreground shadow-lg",
      )}
      disabled={pending}
      aria-busy={pending}
      aria-label={floating ? "浮动多选操作" : "多选操作"}
    >
      <span
        className="whitespace-nowrap text-xs tabular-nums text-basalt-muted-foreground"
        role="status"
      >
        已选 {selection.count} 项
      </span>
      <IconAction
        density="toolbar"
        label={allSelected ? "取消全选" : "全选当前列表"}
        onClick={selection.selectAll}
        disabled={!selection.total || pending}
      >
        {allSelected ? <ListX aria-hidden /> : <ListChecks aria-hidden />}
      </IconAction>
      {actions}
      <IconAction
        ref={deleteRef}
        density="toolbar"
        label="删除所选"
        disabled={!selection.count || pending}
        onClick={selection.requestDelete}
        className="text-basalt-destructive hover:text-basalt-destructive"
      >
        <Trash2 aria-hidden />
      </IconAction>
      <IconAction density="toolbar" label="退出多选" onClick={selection.exit} disabled={pending}>
        <X aria-hidden />
      </IconAction>
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
  const checkbox = useRef<HTMLButtonElement>(null);
  const checked = selection.selected.has(itemId);
  return (
    <div
      {...props}
      className={cn(
        "relative rounded-basalt-card",
        selection.active &&
          checked &&
          "ring-2 ring-basalt-primary ring-offset-2 ring-offset-basalt-card",
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
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              selection.toggle(itemId);
            }
          }}
          onClick={(event) => {
            if (checkbox.current?.contains(event.target as Node)) return;
            event.preventDefault();
            checkbox.current?.focus({ preventScroll: true });
            selection.toggle(itemId);
          }}
          className="absolute inset-0 z-10 cursor-pointer rounded-basalt-card has-focus-visible:ring-2 has-focus-visible:ring-basalt-ring"
        >
          <span className="absolute -left-1.5 -top-1.5 flex rounded-basalt-widget bg-basalt-card p-1.5 shadow-sm ring-1 ring-basalt-border">
            <Checkbox
              ref={checkbox}
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
        className="flex flex-col gap-4"
        size="md"
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
              className="block h-2 w-full appearance-none overflow-hidden rounded-full bg-basalt-primary/10 [&::-webkit-progress-bar]:bg-basalt-primary/10 [&::-webkit-progress-value]:bg-basalt-primary [&::-moz-progress-bar]:bg-basalt-primary"
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
              <span className="tabular-nums text-basalt-muted-foreground">
                {batch.processed} / {batch.items.length}
              </span>
            </div>
            {running && (
              <p className="truncate text-xs text-basalt-muted-foreground">
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
                    <p className="text-xs text-basalt-destructive">{item.error}</p>
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
