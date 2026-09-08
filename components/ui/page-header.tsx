import { PageHeader as BasaltPageHeader } from "@nocoo/basalt/components/page-header";
import type { ComponentProps } from "react";

export function PageHeader(props: ComponentProps<typeof BasaltPageHeader>) {
  return (
    <div className="mb-6">
      <BasaltPageHeader {...props} />
    </div>
  );
}

/** Pulse stand-in matching Basalt PageHeader (text-2xl title + text-sm description). */
export function PageHeaderSkeleton({ hasActions = true }: { hasActions?: boolean }) {
  return (
    <header className="space-y-4" data-testid="page-header-skeleton">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="h-8 w-28 rounded-widget bg-secondary animate-pulse" />
          <div className="h-4 w-48 rounded-widget bg-secondary animate-pulse" />
        </div>
        {hasActions ? <div className="h-8 w-20 rounded-widget bg-secondary animate-pulse" /> : null}
      </div>
    </header>
  );
}
