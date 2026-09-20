"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <Button
      variant="ghost"
      size="icon"
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
    </Button>
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
    <Button
      variant={showHidden ? "secondary" : "outline"}
      size="sm"
      aria-pressed={showHidden}
      onClick={onToggle}
    >
      <Eye strokeWidth={1.5} aria-hidden />
      展示隐藏
    </Button>
  );
}
