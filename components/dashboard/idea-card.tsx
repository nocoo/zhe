"use client";

import { memo } from "react";
import { Trash2, Pencil, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { getTagStyles } from "@/models/tags";
import type { IdeaListItem } from "@/lib/db/scoped";
import type { Tag } from "@/models/types";

/**
 * Format date for display. Falls back to formatDate for full date.
 */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) return "Just now";
      return `${diffMinutes}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

/**
 * Format date for title display when no title is provided.
 */
function formatTitleDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export interface IdeaCardProps {
  idea: IdeaListItem;
  tags?: Tag[];
  onEdit: (idea: IdeaListItem) => void;
  onDelete: (idea: IdeaListItem) => void;
  onClick?: (idea: IdeaListItem) => void;
  className?: string;
}

/**
 * IdeaCard - Grid view card for displaying an idea.
 * Shows title (or timestamp), excerpt, tags, and action buttons.
 */
export const IdeaCard = memo(function IdeaCard({
  idea,
  tags = [],
  onEdit,
  onDelete,
  onClick,
  className,
}: IdeaCardProps) {
  const displayTitle = idea.title || formatTitleDate(idea.createdAt);

  const ideaTags = tags.filter((tag) => idea.tagIds.includes(tag.id));

  const handleClick = () => {
    onClick?.(idea);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(idea);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(idea);
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-card border-0 bg-secondary shadow-none p-4 transition-colors hover:bg-secondary/80 cursor-pointer",
        className,
      )}
      onClick={handleClick}
    >
      {/* Title */}
      <h3 className="font-medium text-foreground line-clamp-1 mb-2">
        {displayTitle}
      </h3>

      {/* Excerpt */}
      {idea.excerpt && (
        <p className="text-sm text-muted-foreground line-clamp-3 flex-1 mb-3">
          {idea.excerpt}
        </p>
      )}

      {/* Tags */}
      {ideaTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {ideaTags.slice(0, 3).map((tag) => {
            const styles = getTagStyles(tag.color);
            return (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-xs"
                style={styles.badge}
              >
                {tag.name}
              </Badge>
            );
          })}
          {ideaTags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{ideaTags.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Footer: date and actions */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/30">
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(idea.updatedAt)}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleEdit}
            aria-label="编辑想法"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={handleDelete}
            aria-label="删除想法"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
});

export interface IdeaRowProps {
  idea: IdeaListItem;
  tags?: Tag[];
  onEdit: (idea: IdeaListItem) => void;
  onDelete: (idea: IdeaListItem) => void;
  onClick?: (idea: IdeaListItem) => void;
  className?: string;
}

/**
 * IdeaRow - List view row for displaying an idea.
 * More compact than IdeaCard, suitable for dense list views.
 */
export const IdeaRow = memo(function IdeaRow({
  idea,
  tags = [],
  onEdit,
  onDelete,
  onClick,
  className,
}: IdeaRowProps) {
  const displayTitle = idea.title || formatTitleDate(idea.createdAt);

  const ideaTags = tags.filter((tag) => idea.tagIds.includes(tag.id));

  const handleClick = () => {
    onClick?.(idea);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(idea);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(idea);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-4 rounded-card border-0 bg-secondary shadow-none px-4 py-3 transition-colors hover:bg-secondary/80 cursor-pointer",
        className,
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <TagIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground truncate">
            {displayTitle}
          </h3>
          {/* Tags (compact) */}
          {ideaTags.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              {ideaTags.slice(0, 2).map((tag) => {
                const styles = getTagStyles(tag.color);
                return (
                  <span
                    key={tag.id}
                    className="inline-block h-2 w-2 rounded-full"
                    style={styles.dot}
                    title={tag.name}
                  />
                );
              })}
              {ideaTags.length > 2 && (
                <span className="text-xs text-muted-foreground">
                  +{ideaTags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
        {idea.excerpt && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {idea.excerpt}
          </p>
        )}
      </div>

      {/* Date */}
      <span className="hidden md:block text-xs text-muted-foreground whitespace-nowrap">
        {formatRelativeDate(idea.updatedAt)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleEdit}
          aria-label="编辑想法"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={handleDelete}
          aria-label="删除想法"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
