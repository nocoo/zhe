"use client";

import { Lightbulb } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { highlightMatches } from "@/models/links";
import type { IdeaListItem } from "@/lib/db/scoped";
import type { Tag } from "@/models/types";
import { HighlightText } from "./highlight-text";
import { TagBadges } from "./tag-badges";

function formatIdeaDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

interface IdeaResultItemProps {
  idea: IdeaListItem;
  trimmedQuery: string;
  tags: Tag[] | undefined;
  onNavigate: (ideaId: number) => void;
}

export function IdeaResultItem({
  idea,
  trimmedQuery,
  tags,
  onNavigate,
}: IdeaResultItemProps) {
  const displayTitle = idea.title || formatIdeaDate(idea.createdAt);

  return (
    <CommandItem
      key={`idea-${idea.id}`}
      value={`idea-${idea.id}`}
      className="flex items-start gap-2.5 py-2"
      onSelect={() => onNavigate(idea.id)}
    >
      <div className="mt-0.5 shrink-0">
        <div className="w-3.5 h-3.5 rounded-[3px] bg-accent flex items-center justify-center">
          <Lightbulb className="w-2 h-2 text-muted-foreground/60" strokeWidth={2} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          <HighlightText segments={highlightMatches(displayTitle, trimmedQuery)} />
        </p>
        {idea.excerpt && (
          <p className="truncate text-xs text-muted-foreground/70 mt-0.5 leading-tight">
            <HighlightText segments={highlightMatches(idea.excerpt, trimmedQuery)} />
          </p>
        )}
        {tags && tags.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground leading-none flex-wrap">
            <TagBadges tags={tags} />
          </div>
        )}
      </div>
    </CommandItem>
  );
}
