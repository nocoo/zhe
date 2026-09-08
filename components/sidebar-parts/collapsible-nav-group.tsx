"use client";

import { ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface CollapsibleNavGroupProps {
  label: string;
  open: boolean;
  onOpenChange: () => void;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

export function CollapsibleNavGroup({
  label,
  open,
  onOpenChange,
  trailing,
  children,
}: CollapsibleNavGroupProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="px-3 mb-1">
      <div className="flex w-full items-center justify-between px-3 py-2.5">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex flex-1 items-center gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1">
          {trailing}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center"
              aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
            >
              <ChevronUp
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform duration-[var(--motion-fast)]",
                  !open && "rotate-180",
                )}
                strokeWidth={1.5}
              />
            </button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent unstyled className="overflow-hidden">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
