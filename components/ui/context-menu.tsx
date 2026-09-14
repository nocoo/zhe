"use client";

import { ContextMenuItem as BasaltContextMenuItem } from "@nocoo/basalt/components/context-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export {
  ContextMenu,
  ContextMenuPanel as ContextMenuContent,
  ContextMenuTrigger,
} from "@nocoo/basalt/components/context-menu";

export function ContextMenuItem({
  className,
  ...props
}: ComponentProps<typeof BasaltContextMenuItem>) {
  return (
    <BasaltContextMenuItem
      className={cn(
        "min-h-9 gap-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
        className,
      )}
      {...props}
    />
  );
}
