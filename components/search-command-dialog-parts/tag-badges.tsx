"use client";

import { getTagStyles } from "@/models/tags";
import type { Tag } from "@/models/types";

/** Small inline list of tag badges with a "+N" overflow indicator. */
export function TagBadges({ tags, max = 3 }: { tags: Tag[]; max?: number }) {
  if (tags.length === 0) return null;
  return (
    <>
      {tags.slice(0, max).map((tag) => {
        const styles = getTagStyles(tag.name);
        return (
          <span
            key={tag.id}
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-normal"
            style={styles.badge}
          >
            <span className="h-1 w-1 rounded-full" style={styles.dot} />
            {tag.name}
          </span>
        );
      })}
      {tags.length > max && (
        <span className="text-[10px] text-muted-foreground">
          +{tags.length - max}
        </span>
      )}
    </>
  );
}
