"use client";

import { Loader2, type LucideIcon, MoreHorizontal } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { IconAction } from "./icon-action";

export interface CardAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean | undefined;
  destructive?: boolean;
  pending?: boolean;
  description?: string | undefined;
}

export function CardActions({
  primary,
  secondary,
  menuItems,
  triggerRef,
  className,
}: {
  primary: ReactNode;
  secondary: CardAction[];
  menuItems?: ReactNode;
  triggerRef?: Ref<HTMLButtonElement>;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(true);
  const [open, setOpen] = useState(false);
  const selectedAction = useRef<(() => void) | null>(null);

  useEffect(() => {
    const card = root.current?.closest("[data-card-actions-container]");
    if (!card) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCompact(entry.contentRect.width < 480);
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={root}
      data-card-actions
      data-compact={compact}
      className={cn(
        "relative flex shrink-0 items-center gap-1 pointer-events-auto [&_svg]:stroke-[1.5] [&_button]:h-8 [&_button]:w-8 [&_button]:shrink-0 [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11",
        className,
      )}
    >
      {primary}
      {!compact &&
        secondary.map(
          ({ label, icon: Icon, onSelect, disabled, destructive, pending, description }) => (
            <span key={label} className="inline-flex" title={description}>
              <IconAction
                label={label}
                title={description ?? label}
                aria-description={description}
                variant="ghost"
                onClick={(event) => {
                  event.currentTarget.focus();
                  onSelect();
                }}
                disabled={disabled}
                loading={pending ?? false}
                className={cn(
                  "text-inherit",
                  destructive && "text-destructive hover:text-destructive",
                )}
                icon={<Icon aria-hidden />}
              />
            </span>
          ),
        )}
      {((compact && secondary.length > 0) || menuItems || open) && (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <IconAction
              ref={triggerRef}
              variant="ghost"
              label="更多收藏操作"
              className="text-inherit data-[state=open]:bg-accent data-[state=open]:text-foreground"
            >
              <MoreHorizontal aria-hidden />
            </IconAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            onCloseAutoFocus={(event) => {
              const action = selectedAction.current;
              selectedAction.current = null;
              if (action || (!compact && !menuItems)) {
                event.preventDefault();
                const trigger =
                  root.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]') ??
                  root.current?.querySelector<HTMLButtonElement>("button");
                trigger?.focus();
                action?.();
              }
            }}
            align="end"
            collisionPadding={8}
            className="w-56 max-w-[calc(100vw-1rem)] [&_[role=menuitem]]:whitespace-normal [&_[role=menuitem]]:break-words [@media(pointer:coarse)]:[&_[role=menuitem]]:min-h-11"
          >
            {(compact || !menuItems) &&
              secondary.map(
                ({ label, icon: Icon, onSelect, disabled, destructive, pending, description }) => (
                  <DropdownMenuItem
                    key={label}
                    disabled={disabled}
                    onSelect={() => {
                      selectedAction.current = onSelect;
                    }}
                    className={destructive ? "text-destructive focus:text-destructive" : undefined}
                  >
                    {pending ? (
                      <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
                    ) : (
                      <Icon aria-hidden />
                    )}
                    <span className="min-w-0 break-words">
                      {label}
                      {description && (
                        <span className="block text-xs text-muted-foreground">{description}</span>
                      )}
                    </span>
                  </DropdownMenuItem>
                ),
              )}
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
