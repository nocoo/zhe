"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconAction } from "./icon-action";

export function LinkVisibilityButton({
  hidden,
  pending,
  onToggle,
  className,
}: {
  hidden: boolean;
  pending: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const Icon = pending ? Loader2 : hidden ? EyeOff : Eye;
  const label = hidden ? "取消隐藏" : "隐藏帖子";
  return (
    <IconAction
      variant="ghost"
      label={label}
      className={cn("pointer-events-auto text-muted-foreground hover:text-foreground", className)}
      aria-label={label}
      aria-pressed={hidden}
      title={label}
      disabled={pending}
      onClick={onToggle}
    >
      <Icon
        className={pending ? "animate-spin motion-reduce:animate-none" : ""}
        strokeWidth={1.5}
        aria-hidden
      />
    </IconAction>
  );
}

export function ShowHiddenButton({
  showHidden,
  onToggle,
}: {
  showHidden: boolean;
  onToggle: () => void;
}) {
  return (
    <IconAction
      variant={showHidden ? "secondary" : "outline"}
      label="展示隐藏"
      aria-pressed={showHidden}
      onClick={onToggle}
    >
      <Eye strokeWidth={1.5} aria-hidden />
    </IconAction>
  );
}
