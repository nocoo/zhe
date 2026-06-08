import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  /** Optional subtitle line under the title. Often a count (e.g. "共 5 条"). */
  description?: React.ReactNode;
  /** Trailing actions (buttons, toolbar). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard page header used at the top of dashboard pages.
 * Title + optional description on the left, optional action cluster
 * on the right. Keeps spacing identical between pages so headers don't
 * shift around when navigating.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between mb-6 gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground truncate">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
