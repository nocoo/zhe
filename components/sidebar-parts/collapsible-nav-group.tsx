"use client";

import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";

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
        <CollapsibleTrigger className="flex flex-1 items-center gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1">
          {trailing}
          <CollapsibleTrigger className="flex items-center">
            <ChevronUp
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform duration-[var(--motion-fast)]",
                !open && "rotate-180",
              )}
              strokeWidth={1.5}
            />
          </CollapsibleTrigger>
        </div>
      </div>
      <div
        className="grid overflow-hidden"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows var(--motion-base) ease-out",
        }}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </Collapsible>
  );
}
