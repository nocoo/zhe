"use client";

import type { HighlightSegment } from "@/models/links";

/** Render text with highlighted keyword matches. */
export function HighlightText({
  segments,
  className,
}: {
  segments: HighlightSegment[];
  className?: string;
}) {
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        const key = `${seg.highlight ? "h" : "t"}-${i}-${seg.text}`;
        return seg.highlight ? (
          <mark key={key} className="bg-highlight/60 text-foreground rounded-sm px-0.5">
            {seg.text}
          </mark>
        ) : (
          <span key={key}>{seg.text}</span>
        );
      })}
    </span>
  );
}
