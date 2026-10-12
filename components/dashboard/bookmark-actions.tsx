"use client";

import { Copy, Loader2, MoreHorizontal } from "lucide-react";
import { type Ref, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BookmarkAction } from "@/models/bookmark-actions";
import { IconAction } from "./icon-action";

export function BookmarkActionButton({ action }: { action: BookmarkAction }) {
  return (
    <IconAction
      label={action.label}
      variant="ghost"
      icon={<action.icon aria-hidden />}
      disabled={action.disabled}
      loading={action.pending ?? false}
      aria-description={action.description}
      title={action.description ?? action.label}
      className={action.destructive ? "text-destructive hover:text-destructive" : undefined}
      onClick={(event) => {
        event.currentTarget.focus();
        void action.run();
      }}
    />
  );
}

function ActionMenu({
  actions,
  label,
  icon: Icon,
  triggerRef,
}: {
  actions: BookmarkAction[];
  label: string;
  icon: typeof Copy;
  triggerRef?: Ref<HTMLButtonElement> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const selected = useRef<BookmarkAction | null>(null);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <IconAction ref={triggerRef} label={label} variant="ghost" icon={<Icon aria-hidden />} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 max-w-[calc(100vw-1rem)] [&_[role=menuitem]]:whitespace-normal [@media(pointer:coarse)]:[&_[role=menuitem]]:min-h-11"
        onCloseAutoFocus={(event) => {
          const action = selected.current;
          selected.current = null;
          if (action) {
            event.preventDefault();
            // Restore the real trigger before a dialog captures its return focus.
            if (triggerRef && typeof triggerRef !== "function") triggerRef.current?.focus();
            void action.run();
          }
        }}
      >
        {actions.map((action) => (
          <span key={action.id} className="contents">
            {action.destructive && <hr className="my-1 border-border" />}
            <DropdownMenuItem
              disabled={action.disabled}
              onSelect={() => {
                selected.current = action;
              }}
              className={action.destructive ? "text-destructive focus:text-destructive" : undefined}
            >
              {action.pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <action.icon aria-hidden />
              )}
              <span>
                {action.label}
                {action.description && (
                  <span className="block text-xs text-muted-foreground">{action.description}</span>
                )}
              </span>
            </DropdownMenuItem>
          </span>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BookmarkActions({
  actions,
  triggerRef,
}: {
  actions: BookmarkAction[];
  triggerRef: Ref<HTMLButtonElement>;
}) {
  const copyTrigger = useRef<HTMLButtonElement>(null);
  return (
    <div
      data-bookmark-actions
      className="flex shrink-0 items-center gap-1 text-muted-foreground [&_svg]:stroke-[1.5] [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11"
    >
      {actions
        .filter((action) => action.placement === "toolbar")
        .map((action) => (
          <BookmarkActionButton key={action.id} action={action} />
        ))}
      <ActionMenu
        actions={actions.filter((action) => action.placement === "copy")}
        label="复制链接"
        icon={Copy}
        triggerRef={copyTrigger}
      />
      <ActionMenu
        actions={actions.filter((action) => action.placement === "menu")}
        label="更多收藏操作"
        icon={MoreHorizontal}
        triggerRef={triggerRef}
      />
    </div>
  );
}
