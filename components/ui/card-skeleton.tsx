import { cn } from "@/lib/utils";

/**
 * Generic "rounded card placeholder" skeletons used while loading
 * list/grid views. Keeps the visual rhythm consistent across pages.
 *
 * For more complex skeletons (multi-row headers, custom shapes) pages
 * still author their own; use these only for plain rectangular card
 * lists/grids.
 */

/** Shared card-grid track — max 6 columns so tiles stay compact. */
export const CARD_GRID_CLASS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3";

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
    <div className={cn("space-y-2", className)} data-testid="card-list">
      {Array.from({ length: rows }, (_, i) => `sk-row-${i}`).map((id) => (
        <div key={id} className={cn("rounded-card bg-secondary animate-pulse", rowHeightClass)} />
      ))}
    </div>
  );
}

interface CardGridSkeletonProps {
  /** Number of placeholder cards (default 12 = two rows of six). */
  count?: number;
  /** Tailwind aspect-ratio class for each placeholder card. */
  aspectClass?: string;
  /** Override the grid column setup. */
  gridClass?: string;
  className?: string;
}

export function CardGridSkeleton({
  count = 12,
  aspectClass = "aspect-[5/4]",
  gridClass = CARD_GRID_CLASS,
  className,
}: CardGridSkeletonProps) {
  return (
    <div className={cn(gridClass, className)} data-testid="card-grid">
      {Array.from({ length: count }, (_, i) => `sk-card-${i}`).map((id) => (
        <div key={id} className={cn("rounded-card bg-secondary animate-pulse", aspectClass)} />
      ))}
    </div>
  );
}
