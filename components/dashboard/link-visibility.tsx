"use client";

import { Eye } from "lucide-react";
import { IconAction } from "./icon-action";

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
