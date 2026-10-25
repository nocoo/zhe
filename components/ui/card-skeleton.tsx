import { AnimatedCardList } from "@/components/ui/animated-card-list";
import { cn } from "@/lib/utils";

export const CARD_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3";

export const BOOKMARK_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3";
export const BOOKMARK_CARD_CLASS =
  "group flex min-w-0 flex-col overflow-hidden rounded-card ring-1 ring-border/50 transition-shadow hover:ring-border";

function Bone({ className }: { className: string }) {
  return <div className={cn("shrink-0 rounded bg-muted-foreground/10", className)} />;
}

function BookmarkFooterBones({
  compact = false,
  reader = false,
  showClassification = true,
}: {
  compact?: boolean;
  reader?: boolean;
  showClassification?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-auto shrink-0",
        compact && "sm:flex sm:items-center sm:border-t sm:border-border/60",
      )}
    >
      {showClassification && (
        <div className="flex h-9 flex-1 items-center gap-2 px-3">
          <Bone className="h-3 w-16" />
          <Bone className="h-4 w-16" />
        </div>
      )}
      <div
        className={cn(
          "flex min-h-10 items-center gap-1 border-t border-border/60 px-3 py-1",
          compact && "sm:border-t-0",
        )}
      >
        <Bone className="mr-auto h-3 w-12" />
        {reader && <Bone className="size-8 [@media(pointer:coarse)]:size-11" />}
        {[0, 1, 2].map((id) => (
          <Bone key={id} className="size-8 [@media(pointer:coarse)]:size-11" />
        ))}
      </div>
    </div>
  );
}

export function CardListSkeleton({
  rows = 6,
  rowHeightClass,
  className,
  variant = "list",
}: {
  rows?: number;
  rowHeightClass?: string;
  className?: string;
  variant?: "list" | "idea" | "upload";
}) {
  if (variant === "list")
    return (
      <div
        className={cn("space-y-3", className)}
        data-testid="card-list"
        role="status"
        aria-busy="true"
        aria-label="正在加载列表"
      >
        {Array.from({ length: rows }, (_, i) => `bookmark-${i}`).map((id) => (
          <div
            key={id}
            aria-hidden
            className={cn(
              BOOKMARK_CARD_CLASS,
              "animate-pulse motion-reduce:animate-none",
              rowHeightClass,
            )}
          >
            <div className="flex min-h-24 items-center gap-3 px-3 py-2">
              <Bone className="hidden h-20 w-28 sm:block" />
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-2/3" />
                <Bone className="h-3 w-1/3" />
                <Bone className="h-5 w-full" />
              </div>
            </div>
            <BookmarkFooterBones compact />
          </div>
        ))}
      </div>
    );
  return (
    <div
      className={cn("space-y-2", className)}
      data-testid="card-list"
      role="status"
      aria-busy="true"
      aria-label="正在加载列表"
    >
      {Array.from({ length: rows }, (_, i) => `sk-row-${i}`).map((id) => (
        <div
          key={id}
          aria-hidden
          className={cn(
            "overflow-hidden rounded-card bg-secondary p-4 ring-1 ring-border/40 animate-pulse motion-reduce:animate-none",
            variant === "idea" && "py-3",
            rowHeightClass,
          )}
        >
          <div
            className={cn(
              "flex items-center gap-4",
              variant === "idea" ? "h-[46px]" : "min-h-[62px]",
            )}
          >
            <Bone className={"size-10 rounded-widget"} />
            <div className="min-w-0 flex-1 space-y-2">
              <Bone className="h-4 w-1/3" />
              <Bone className="h-3 w-3/4" />
              {variant !== "idea" && <Bone className="h-3 w-1/2" />}
            </div>
            <Bone className="size-8 rounded-widget" />
          </div>
        </div>
      ))}
    </div>
  );
}

type GridVariant = "link" | "github" | "x" | "idea";

function GridCardBones({ variant, index }: { variant: GridVariant; index: number }) {
  if (variant === "x")
    return (
      <>
        <div className="space-y-2.5 p-3">
          <div className="flex items-center gap-2">
            <Bone className="size-7 rounded-full" />
            <Bone className="h-4 w-2/3" />
          </div>
          <Bone className="h-10 w-full" />
          {index % 3 !== 0 && (
            <Bone className={cn("w-full", index % 3 === 1 ? "aspect-square" : "aspect-video")} />
          )}
          <Bone className="h-3 w-2/3" />
        </div>
        <BookmarkFooterBones reader showClassification={false} />
      </>
    );
  if (variant === "idea")
    return (
      <div className="p-4">
        <div className="mb-2 flex h-6 items-center">
          <Bone className="h-4 w-3/4" />
        </div>
        <div className="mb-3 flex h-15 flex-col justify-center gap-2">
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-2/3" />
        </div>
        <Bone className="mb-3 h-5 w-16 rounded-full" />
        <div className="flex h-[37px] items-center justify-between border-t border-border/60 pt-2">
          <Bone className="h-3 w-12" />
          <Bone className="h-5 w-12" />
        </div>
      </div>
    );
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <Bone className="h-5 w-3/4" />
        <Bone className="h-3 w-1/2" />
        <Bone className="min-h-0 w-full flex-1" />
        <Bone className="h-10 w-full" />
      </div>
      <BookmarkFooterBones reader={variant === "github"} />
    </>
  );
}

export function CardGridSkeleton({
  count = 12,
  aspectClass,
  gridClass,
  className,
  variant = "link",
}: {
  count?: number;
  aspectClass?: string;
  gridClass?: string;
  className?: string;
  variant?: GridVariant;
}) {
  const cards = Array.from({ length: count }, (_, i) => `sk-card-${i}`).map((id, index) => (
    <div
      key={id}
      aria-hidden
      className={cn(
        "overflow-hidden rounded-card bg-secondary ring-1 ring-border/40 animate-pulse motion-reduce:animate-none",
        variant !== "idea" && BOOKMARK_CARD_CLASS,
        variant !== "idea" && variant !== "x" && "h-96",
        aspectClass,
      )}
    >
      <GridCardBones variant={variant} index={index} />
    </div>
  ));
  return variant === "x" ? (
    <AnimatedCardList
      className={cn(gridClass ?? BOOKMARK_GRID_CLASS, className)}
      masonry
      data-testid="card-grid"
      role="status"
      aria-busy="true"
      aria-label="正在加载卡片"
    >
      {cards}
    </AnimatedCardList>
  ) : (
    <div
      className={cn(
        gridClass ?? (variant === "idea" ? CARD_GRID_CLASS : BOOKMARK_GRID_CLASS),
        className,
      )}
      data-testid="card-grid"
      role="status"
      aria-busy="true"
      aria-label="正在加载卡片"
    >
      {cards}
    </div>
  );
}
