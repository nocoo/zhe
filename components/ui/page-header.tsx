"use client";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Content heading (h1). */
  title: React.ReactNode;
  /** Short inline suffix beside the title: counts, ranges or a one-line note. */
  meta?: React.ReactNode;
  /** Toolbar row: filters, view controls, then primary actions (last). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Single-row page header. Project override of Basalt `PageHeader`: filters
 * stay on the title row instead of taking the `filters` slot, and the
 * description becomes an inline muted suffix so no page spends a row on it.
 */
export function PageHeader({ title, meta, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "mb-4 flex min-w-0 flex-col gap-2 md:mb-5 md:flex-row md:items-center md:gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="min-w-0 truncate font-basalt-display text-2xl font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {meta ? (
          <p
            {...(typeof meta === "string" ? { title: meta } : {})}
            className="min-w-0 shrink-0 truncate text-xs tabular-nums text-muted-foreground"
          >
            {meta}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:ml-auto md:flex-nowrap md:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/** Pulse stand-in matching the single-row PageHeader. */
export function PageHeaderSkeleton({ hasActions = true }: { hasActions?: boolean }) {
  return (
    <header className="mb-4 flex items-center gap-3 md:mb-5" data-testid="page-header-skeleton">
      <div className="h-6 w-28 rounded-widget bg-secondary animate-pulse motion-reduce:animate-none" />
      <div className="h-3 w-16 rounded-widget bg-secondary animate-pulse motion-reduce:animate-none" />
      {hasActions ? (
        <div className="ml-auto h-7 w-48 rounded-widget bg-secondary animate-pulse motion-reduce:animate-none" />
      ) : null}
    </header>
  );
}
