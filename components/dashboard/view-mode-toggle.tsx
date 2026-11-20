"use client";

import { ToggleGroup, ToggleGroupItem } from "@nocoo/basalt/components/toggle-group";
import { LayoutGrid, LayoutList } from "@nocoo/basalt/icons";

const views = [
  { value: "list", label: "List view", icon: LayoutList },
  { value: "grid", label: "Grid view", icon: LayoutGrid },
] as const;

/** Shared list/grid switch so every collection page aligns with the toolbar. */
export function ViewModeToggle({
  value,
  onChange,
}: {
  value: "list" | "grid";
  onChange: (mode: "list" | "grid") => void;
}) {
  return (
    <ToggleGroup
      type="single"
      orientation="horizontal"
      aria-label="视图模式"
      value={value}
      onValueChange={(next) => {
        if (next === "list" || next === "grid") onChange(next);
      }}
    >
      {views.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className="size-6 justify-center p-0"
        >
          <Icon className="size-4" strokeWidth={1.5} aria-hidden />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
