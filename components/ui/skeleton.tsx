import { cn } from "@/lib/utils";

/**
 * Skeleton loading placeholder.
 * Per Basalt B-4 spec: animate-pulse rounded-md bg-muted.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
