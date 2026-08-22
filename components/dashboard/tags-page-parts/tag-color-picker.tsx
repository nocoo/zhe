"use client";

import { cn } from "@/lib/utils";
import { getTagStyles, TAG_PALETTE, type TagPaletteColor } from "@/models/tags";

interface TagColorPickerProps {
  value: string;
  onChange: (color: TagPaletteColor) => void;
  disabled?: boolean;
}

export function TagColorPicker({ value, onChange, disabled }: TagColorPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TAG_PALETTE.map((color) => {
        const styles = getTagStyles(color, color);
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            aria-pressed={selected}
            aria-label={color}
            disabled={disabled}
            data-testid={`tag-color-${color}`}
            onClick={() => onChange(color)}
            className={cn(
              "h-6 w-6 rounded-full border border-transparent",
              selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
            )}
            style={{ backgroundColor: styles.dot.backgroundColor }}
          />
        );
      })}
    </div>
  );
}
