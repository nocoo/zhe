"use client";

import { LayoutGrid, LayoutList } from "lucide-react";
import { IconAction } from "./icon-action";

/** Shared list/grid switch so every collection page aligns with the toolbar. */
export function ViewModeToggle({
  value,
  onChange,
}: {
  value: "list" | "grid";
  onChange: (mode: "list" | "grid") => void;
}) {
  return (
    <>
      <IconAction
        density="toolbar"
        variant={value === "list" ? "secondary" : "outline"}
        aria-pressed={value === "list"}
        label="List view"
        onClick={() => onChange("list")}
      >
        <LayoutList aria-hidden />
      </IconAction>
      <IconAction
        density="toolbar"
        variant={value === "grid" ? "secondary" : "outline"}
        aria-pressed={value === "grid"}
        label="Grid view"
        onClick={() => onChange("grid")}
      >
        <LayoutGrid aria-hidden />
      </IconAction>
    </>
  );
}
