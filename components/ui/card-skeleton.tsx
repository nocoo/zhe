import { cn } from "@/lib/utils";

/**
 * Generic "rounded card placeholder" skeletons used while loading
 * list/grid views. Keeps the visual rhythm consistent across pages.
 *
 * For more complex skeletons (multi-row headers, custom shapes) pages
 * still author their own; use these only for plain rectangular card
 * lists/grids.
 */

interface CardListSkeletonProps {
  /** Number of placeholder rows (default 6). */
  rows?: number;
  /** Row height class — defaults to a comfortable LinkCard-like row. */
  rowHeightClass?: string;
  className?: string;
}

export function CardListSkeleton({
  rows = 6,
  rowHeightClass = "h-[88px]",
  className,
}: CardListSkeletonProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-card bg-secondary animate-pulse",
            rowHeightClass,
          )}
        />
      ))}
    </div>
  );
}

interface CardGridSkeletonProps {
  /** Number of placeholder cards (default 8). */
  count?: number;
  /** Tailwind aspect-ratio class for each placeholder card. */
  aspectClass?: string;
  /** Override the grid column setup. */
  gridClass?: string;
  className?: string;
}

const DEFAULT_GRID_CLASS =
  "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4";

export function CardGridSkeleton({
  count = 8,
  aspectClass = "aspect-[5/4]",
  gridClass = DEFAULT_GRID_CLASS,
  className,
}: CardGridSkeletonProps) {
  return (
    <div className={cn(gridClass, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-card bg-secondary animate-pulse",
            aspectClass,
          )}
        />
      ))}
    </div>
  );
}
