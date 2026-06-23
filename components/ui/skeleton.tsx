import { cn } from "@/lib/utils";

/**
 * Skeleton loading placeholder.
 * B05 spec: bg-background so the skeleton sits one tier darker than the
 * L2 cards (bg-secondary) it typically appears inside.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-background", className)}
      {...props}
    />
  );
}

export { Skeleton };
