"use client";

import { forwardRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const IconAction = forwardRef<
  HTMLButtonElement,
  ButtonProps & { label: string; shortcut?: string }
>(function IconAction({ label, shortcut, className, children, ...props }, ref) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            variant="outline"
            size="sm"
            {...props}
            aria-label={label}
            className={cn("size-8 shrink-0 p-0 [&_svg]:stroke-[1.5]", className)}
          >
            {children}
          </Button>
        </TooltipTrigger>
        {/* Closed tooltip layers must not intercept Escape in a newly opened dialog. */}
        <TooltipContent className="data-[state=closed]:animate-none">
          {label}
          {shortcut && <kbd className="ml-2 text-xs">{shortcut}</kbd>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
