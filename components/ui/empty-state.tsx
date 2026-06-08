import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional action button (typically a CreateXModal trigger). */
  action?: React.ReactNode;
  className?: string;
  /** Pass-through for tests that look for the empty surface. */
  "data-testid"?: string;
}

/**
 * Shared empty-state surface used by Inbox, Links, Ideas, Uploads, etc.
 * Always renders a centered icon + headline + optional description and
 * optional action. Keeps copy and spacing consistent so every page reads
 * with the same rhythm.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  "data-testid": testId,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-card border-0 bg-secondary shadow-none p-12 text-center",
        className,
      )}
    >
      <Icon
        className="w-10 h-10 mx-auto text-muted-foreground mb-4"
        strokeWidth={1.5}
      />
      <p className="text-sm text-muted-foreground mb-2">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mb-6">{description}</p>
      )}
      {action}
    </div>
  );
}
