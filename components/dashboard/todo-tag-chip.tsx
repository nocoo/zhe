"use client";

/**
 * Coloured chip primitive for a single free-form todo tag.
 *
 * Colour comes from `todoTagColor(name)` (deterministic FNV-1a hash of the
 * lower-cased name), so the same tag renders identically across sessions
 * and users with no persisted state. The component is pure and memoised —
 * a large tree with many chips must not re-render every chip on every
 * unrelated state change.
 *
 * Docs: docs/21-todos-feature.md — "Tag Colour Rule" and
 * "components/dashboard/todo-tag-chip.tsx".
 */

import { X } from "lucide-react";
import { memo } from "react";
import { todoTagColor } from "@/lib/todo-tag-color";
import { cn } from "@/lib/utils";

export interface TodoTagChipProps {
  /** Tag name — free-form; the component canonicalises for display only. */
  name: string;
  /** Optional click handler (chip acts as a filter toggle). */
  onClick?: (() => void) | undefined;
  /** When provided, renders a small × affordance that calls this instead. */
  onRemove?: (() => void) | undefined;
  /** Extra tailwind classes for layout tweaks; visual tokens stay derived. */
  className?: string | undefined;
}

/**
 * We deliberately keep the outer element a non-interactive `<span>` when
 * `onRemove` is present so the remove `<button>` sits as its sibling
 * instead of nesting inside another `<button>` (nested interactive
 * controls are invalid HTML and break keyboard focus + screen-reader
 * semantics). Layout shape by prop combo:
 *
 *   [ onClick only        ]  →  <button>label</button>
 *   [ onClick + onRemove  ]  →  <span> <button>label</button> <button>×</button> </span>
 *   [ onRemove only       ]  →  <span> <span>label</span> <button>×</button> </span>
 *   [ neither             ]  →  <span>label</span>
 */
export const TodoTagChip = memo(function TodoTagChip({
  name,
  onClick,
  onRemove,
  className,
}: TodoTagChipProps) {
  const colours = todoTagColor(name);
  const displayName = name.trim();

  const style = {
    backgroundColor: colours.bg,
    color: colours.fg,
    borderColor: colours.border,
  } as const;

  const clickable = typeof onClick === "function";
  const removable = typeof onRemove === "function";

  const wrapperClass = cn(
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
    className,
  );

  // Label element: bare button when the chip is the click target and there
  // is nothing else interactive to peel off; otherwise a plain <span>.
  const labelNode =
    clickable && !removable ? (
      <button
        type="button"
        onClick={onClick}
        style={style}
        className={cn(
          wrapperClass,
          "cursor-pointer hover:opacity-90 focus:outline-hidden focus:ring-2 focus:ring-ring",
        )}
        data-todo-tag={displayName}
      >
        <span className="max-w-[10rem] truncate">{displayName}</span>
      </button>
    ) : null;

  if (labelNode) return labelNode;

  // Anything with a remove affordance renders a wrapper <span> so the two
  // controls sit as siblings — this is what avoids the nested-button
  // HTML validity bug and keeps keyboard focus predictable.
  return (
    <span style={style} className={wrapperClass} data-todo-tag={displayName}>
      {clickable ? (
        <button
          type="button"
          onClick={onClick}
          className="max-w-[10rem] truncate cursor-pointer hover:opacity-90 focus:outline-hidden focus:ring-1 focus:ring-ring rounded-sm bg-transparent border-0 p-0 text-inherit font-inherit"
          style={{ color: "inherit" }}
        >
          {displayName}
        </button>
      ) : (
        <span className="max-w-[10rem] truncate">{displayName}</span>
      )}
      {removable ? (
        <button
          type="button"
          onClick={(e) => {
            // Prevent the main label click when the ✕ was clicked.
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${displayName}`}
          className="-mr-1 rounded-full p-0.5 hover:bg-black/10 focus:outline-hidden focus:ring-1 focus:ring-ring"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
});
