"use client";

import { Button } from "@/components/ui/button";
import {
  SEARCH_SOURCE_LABELS,
  SEARCH_SOURCES,
  type SearchFilter,
  type SearchResponse,
} from "@/models/search";

export function SearchSourceFilter({
  value,
  counts,
  onChange,
}: {
  value: SearchFilter;
  counts?: SearchResponse["counts"] | undefined;
  onChange: (source: SearchFilter) => void;
}) {
  return (
    <fieldset
      aria-label="按来源筛选"
      className="flex flex-wrap items-center gap-1"
      onKeyDown={(event) => event.stopPropagation()}
    >
      {(["all", ...SEARCH_SOURCES] as const).map((source) => (
        <Button
          key={source}
          size="sm"
          variant="ghost"
          aria-pressed={value === source}
          className={
            value === source
              ? "text-primary ring-1 ring-inset ring-primary/25"
              : "text-muted-foreground"
          }
          onClick={() => onChange(source)}
        >
          {source === "all" ? "全部" : SEARCH_SOURCE_LABELS[source]}
          {counts && (
            <span className="text-xs tabular-nums opacity-70">
              {source === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[source]}
            </span>
          )}
        </Button>
      ))}
    </fieldset>
  );
}
