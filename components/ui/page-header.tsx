"use client";

/** Pulse stand-in matching Basalt `PageHeader` (title, description row, actions). */
export function PageHeaderSkeleton({
  hasActions = true,
  hasDescription = true,
}: {
  hasActions?: boolean;
  hasDescription?: boolean;
}) {
  return (
    <header className="min-w-0 shrink-0 space-y-4" data-testid="page-header-skeleton" aria-hidden>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-8 w-32 rounded-widget bg-secondary animate-pulse motion-reduce:animate-none" />
          {hasDescription ? (
            <div className="h-4 w-56 max-w-[65ch] rounded-widget bg-secondary animate-pulse motion-reduce:animate-none" />
          ) : null}
        </div>
        {hasActions ? (
          <div className="h-7 w-48 shrink-0 rounded-widget bg-secondary animate-pulse motion-reduce:animate-none" />
        ) : null}
      </div>
    </header>
  );
}
