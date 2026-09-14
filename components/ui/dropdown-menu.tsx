"use client";

import { DropdownMenuItem as BasaltDropdownMenuItem } from "@nocoo/basalt/components/dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@nocoo/basalt/components/dropdown-menu";

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof BasaltDropdownMenuItem>) {
  return (
    <BasaltDropdownMenuItem
      className={cn(
        "min-h-9 gap-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
        className,
      )}
      {...props}
    />
  );
}
