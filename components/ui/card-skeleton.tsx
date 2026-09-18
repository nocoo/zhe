import { AnimatedCardList } from "@/components/ui/animated-card-list";
import { cn } from "@/lib/utils";

/** Shared card-grid track — max 6 columns so tiles stay compact. */
export const CARD_GRID_CLASS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3";
export const GITHUB_CARD_GRID_CLASS =
  "grid grid-cols-1 gap-3 @2xl/github:grid-cols-2 @5xl/github:grid-cols-3 @7xl/github:grid-cols-4";

function Bone({ className }: { className: string }) {
  return <div className={cn("shrink-0 rounded bg-muted-foreground/10", className)} />;
}

function TextBones() {
  return (
    <div className="flex h-10 flex-col justify-center gap-2">
      <Bone className="h-3 w-full" />
      <Bone className="h-3 w-3/4" />
    </div>
  );
}

function FooterBones({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t border-border/60 px-3",
        compact ? "h-11" : "h-[53px]",
      )}
    >
      <Bone className="mr-auto h-3 w-16" />
      <Bone className="size-5" />
      <Bone className="size-5" />
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
            <Bone
              className={
                variant === "idea" || variant === "upload"
                  ? "size-10 rounded-widget"
                  : "hidden h-[62px] w-[118px] rounded-widget sm:block"
              }
            />
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
  if (variant === "github")
    return (
      <>
        <div className="space-y-2 p-3">
          <div className="flex h-7 items-center justify-between gap-3">
            <Bone className="h-4 w-2/3" />
            <Bone className="size-6 rounded-widget" />
          </div>
          <div className="flex h-6 items-center gap-2">
            <Bone className="h-4 w-12 rounded-full" />
            <Bone className="h-3 w-20" />
          </div>
          <TextBones />
          <div className="grid h-8 grid-cols-3 items-end gap-2 border-t border-border/60 pt-2">
            {[0, 1, 2].map((id) => (
              <Bone key={id} className="h-4 w-3/4" />
            ))}
          </div>
          <div className="grid h-5 grid-cols-3 items-center gap-2">
            {[0, 1, 2].map((id) => (
              <Bone key={id} className="h-3 w-2/3" />
            ))}
          </div>
        </div>
        <FooterBones compact />
      </>
    );
  if (variant === "x")
    return (
      <>
        <div className="space-y-2.5 p-3">
          <div className="flex items-center gap-2">
            <Bone className="size-7 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-3 w-2/3" />
              <Bone className="h-2 w-1/2" />
            </div>
            <Bone className="size-6 rounded-widget" />
          </div>
          <TextBones />
          {index % 3 !== 0 && (
            <Bone
              className={cn(
                "w-full rounded-widget",
                index % 3 === 1 ? "aspect-square" : "aspect-video",
              )}
            />
          )}
          <Bone className="h-3 w-2/3" />
        </div>
        <FooterBones />
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
      {variant === "link" && <Bone className="aspect-[4/3] w-full rounded-none" />}
      <div className="space-y-2 p-4">
        <Bone className="h-5 w-3/4" />
        <TextBones />
        <div className="flex h-7 items-center justify-between border-t border-border/60 pt-2">
          <Bone className="h-3 w-1/3" />
          <Bone className="h-3 w-1/4" />
        </div>
      </div>
    </>
  );
}

export function CardGridSkeleton({
  count = 12,
  aspectClass,
  gridClass = CARD_GRID_CLASS,
  className,
  variant = "link",
}: {
  count?: number;
  aspectClass?: string;
  gridClass?: string;
  className?: string;
  variant?: GridVariant;
}) {
  const cards = Array.from({ length: count }, (_, i) => `sk-card-${i}`).map((id, i) => (
    <div
      key={id}
      aria-hidden
      className={cn(
        "overflow-hidden rounded-card bg-secondary ring-1 ring-border/40 animate-pulse motion-reduce:animate-none",
        aspectClass,
      )}
    >
      <GridCardBones variant={variant} index={i} />
    </div>
  ));
  return variant === "x" ? (
    <AnimatedCardList
      className={cn(gridClass, className)}
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
      className={cn(gridClass, className)}
      data-testid="card-grid"
      role="status"
      aria-busy="true"
      aria-label="正在加载卡片"
    >
      {cards}
    </div>
  );
}
