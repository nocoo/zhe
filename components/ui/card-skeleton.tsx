import { cn } from "@/lib/utils";

export const CARD_GRID_CLASS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 min-[160rem]:grid-cols-8 gap-3";

export const BOOKMARK_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3";
export const BOOKMARK_CARD_CLASS =
  "group flex min-w-0 flex-col overflow-hidden rounded-card shadow-card ring-1 ring-border/40 transition-shadow hover:shadow-card-hover";

function Bone({ className }: { className: string }) {
  return <div className={cn("shrink-0 rounded bg-muted-foreground/10", className)} />;
}

function BookmarkFooterBones({
  compact = false,
  reader = false,
}: {
  compact?: boolean;
  reader?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-auto shrink-0",
        compact && "sm:flex sm:items-center sm:border-t sm:border-border/60",
      )}
    >
      <div className="flex h-10 flex-1 items-center gap-2 px-3">
        <Bone className="h-3 w-16" />
        <Bone className="h-4 w-16" />
      </div>
      <div
        className={cn(
          "flex min-h-11 items-center gap-1 border-t border-border/60 px-3 py-1",
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
        className={cn("space-y-2", className)}
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
            <div className="flex h-28 items-center gap-3 p-3">
              <Bone className="hidden h-20 w-28 sm:block" />
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-2/3" />
                <Bone className="h-3 w-1/3" />
                <Bone className="h-10 w-full" />
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

function GridCardBones({ variant }: { variant: GridVariant }) {
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
      <BookmarkFooterBones reader={variant === "github" || variant === "x"} />
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
  const cards = Array.from({ length: count }, (_, i) => `sk-card-${i}`).map((id) => (
    <div
      key={id}
      aria-hidden
      className={cn(
        "overflow-hidden rounded-card bg-secondary ring-1 ring-border/40 animate-pulse motion-reduce:animate-none",
        variant !== "idea" && `${BOOKMARK_CARD_CLASS} h-96`,
        aspectClass,
      )}
    >
      <GridCardBones variant={variant} />
    </div>
  ));
  return (
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
