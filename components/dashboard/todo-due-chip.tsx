"use client";

/**
 * Chip primitive that renders the "when is this due" state for a todo.
 *
 * Colour + label derive from `dueStatus(now, dueAt, done)`
 * (docs/21-todos-feature.md — "Due Date"). The component is purely
 * presentational; the caller decides `now` (usually `new Date()`, but
 * tests inject a fixed instant for determinism). No chip is rendered
 * when `dueAt === null` — matches the "no chip" row in the design's
 * status table.
 */

import { AlertCircle, CalendarDays, Check, Clock } from "@nocoo/basalt/icons";
import { type CSSProperties, memo } from "react";
import { type DueStatus, dueStatus } from "@/lib/todo-due";
import { cn } from "@/lib/utils";

export interface TodoDueChipProps {
  /** Stored dueAt; `null` = no due date (chip is not rendered). */
  dueAt: Date | null;
  /** Whether the todo is complete. Flips the chip to `done-with-due`. */
  done: boolean;
  /** Reference "now"; defaults to a fresh Date at render time. */
  now?: Date | undefined;
  className?: string | undefined;
}

/**
 * Per-kind visual tokens. Kept as a lookup table so React re-renders don't
 * pay for class-string composition, and so a future dark-mode pass can
 * flip the tokens in one place.
 */
const KIND_STYLES: Record<
  Exclude<DueStatus["kind"], "no-due">,
  {
    className: string;
    Icon: typeof AlertCircle;
    style?: CSSProperties;
  }
> = {
  overdue: {
    className: "bg-basalt-destructive/15 text-basalt-destructive border-basalt-destructive/25",
    Icon: AlertCircle,
  },
  today: {
    className: "bg-basalt-warning/15 text-basalt-warning border-basalt-warning/25",
    Icon: Clock,
  },
  tomorrow: {
    className: "bg-basalt-warning/10 text-basalt-warning border-basalt-warning/20",
    Icon: Clock,
  },
  soon: {
    className: "bg-basalt-secondary text-basalt-secondary-foreground border-basalt-border",
    Icon: CalendarDays,
  },
  later: {
    className: "bg-basalt-muted text-basalt-muted-foreground border-basalt-border",
    Icon: CalendarDays,
  },
  "done-with-due": {
    // Low-emphasis: completed todos should not visually shout regardless
    // of when they were originally due — matches the design's rule.
    className: "bg-basalt-muted text-basalt-muted-foreground/70 border-basalt-border/60",
    Icon: Check,
  },
};

export const TodoDueChip = memo(function TodoDueChip({
  dueAt,
  done,
  now,
  className,
}: TodoDueChipProps) {
  const referenceNow = now ?? new Date();
  const status = dueStatus(referenceNow, dueAt, done);
  if (status.kind === "no-due") return null;

  const tokens = KIND_STYLES[status.kind];
  const { Icon } = tokens;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        tokens.className,
        className,
      )}
      data-due-kind={status.kind}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span>{status.label}</span>
    </span>
  );
});
