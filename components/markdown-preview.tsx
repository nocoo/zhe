"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export interface MarkdownPreviewProps {
  /** Markdown source text to render */
  content: string;
  /** Additional CSS class names */
  className?: string;
  /** Placeholder text when content is empty */
  placeholder?: string;
}

/**
 * MarkdownPreview — renders Markdown source as styled HTML.
 * Supports GFM (tables, task lists, strikethrough, autolinks) via remark-gfm.
 * Uses Tailwind Typography plugin (`prose`) for consistent styling.
 */
export function MarkdownPreview({
  content,
  className,
  placeholder = "预览将在此处显示...",
}: MarkdownPreviewProps) {
  if (!content.trim()) {
    return (
      <div className={cn("text-muted-foreground/50 italic text-sm", className)}>
        {placeholder}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        // Headings
        "prose-headings:font-semibold",
        // Links
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        // Code blocks
        "prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-md",
        "prose-code:text-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none",
        // Images
        "prose-img:rounded-md",
        // Tables
        "prose-th:text-left",
        // Task lists
        "prose-li:marker:text-muted-foreground",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
