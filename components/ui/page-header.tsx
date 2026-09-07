import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, filters, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 space-y-4", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        ) : null}
      </div>
      {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
    </header>
  );
}

/** Pulse stand-in that matches PageHeader density (text-lg + text-sm + xs action). */
export function PageHeaderSkeleton({ hasActions = true }: { hasActions?: boolean }) {
  return (
    <header className="mb-6" data-testid="page-header-skeleton">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="h-7 w-28 rounded-widget bg-secondary animate-pulse" />
          <div className="h-4 w-48 rounded-widget bg-secondary animate-pulse" />
        </div>
        {hasActions ? <div className="h-8 w-20 rounded-widget bg-secondary animate-pulse" /> : null}
      </div>
    </header>
  );
}
