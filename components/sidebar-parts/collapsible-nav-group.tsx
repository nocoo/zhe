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

/**
 * Basalt `SidebarGroup` metrics with a caller-controlled open state and a
 * trailing action slot. The trailing action and the disclosure chevron form
 * one right-aligned cluster so their right edge matches the nav row content.
 */
export function CollapsibleNavGroup({
  label,
  open,
  onOpenChange,
  trailing,
  children,
}: CollapsibleNavGroupProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="shrink-0 pt-basalt-layout-sm">
      <div className="flex w-full items-center gap-basalt-space-sm pr-basalt-row-x">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="basalt-focus basalt-focus-inset flex min-w-0 flex-1 cursor-pointer items-center rounded-basalt-md px-basalt-row-x py-basalt-space-lg text-left text-basalt-sm font-semibold leading-basalt-row tracking-wide text-basalt-muted-foreground uppercase transition-colors basalt-motion hover:text-basalt-foreground"
          >
            <span className="min-w-0 truncate">{label}</span>
          </button>
        </CollapsibleTrigger>
        {trailing}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={open ? `折叠 ${label}` : `展开 ${label}`}
            className="basalt-focus flex size-5 shrink-0 items-center justify-center rounded-basalt-sm text-basalt-muted-foreground transition-colors basalt-motion hover:bg-basalt-hover hover:text-basalt-foreground"
          >
            <ChevronUp
              className={cn(
                "size-4 transition-transform basalt-motion duration-basalt-normal",
                !open && "rotate-180",
              )}
              strokeWidth={1.5}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent unstyled className="overflow-hidden">
        <div className="flex flex-col gap-basalt-nav-gap pt-basalt-nav-gap">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
