"use client";

import { cn } from "@/lib/utils";

export function CardTitleText({ title, original }: { title: string; original?: string }) {
  return (
    <span
      className="flex min-w-0 items-baseline gap-2"
      title={[title, original].filter(Boolean).join(" · ")}
    >
      <span className="min-w-0 truncate">{title}</span>
      {original && (
        <span className="min-w-0 max-w-[40%] shrink-[2] truncate text-xs font-normal text-muted-foreground">
          {original}
        </span>
      )}
    </span>
  );
}

/** Expand on demand, including touch/keyboard; clamping never removes stored text. */
export function CardText({
  text,
  auxiliary = false,
  code = false,
  singleLine = false,
}: {
  text: string;
  auxiliary?: boolean;
  code?: boolean;
  singleLine?: boolean;
}) {
  if (!text) return null;
  return (
    <details
      className={cn(
        "group/text min-w-0",
        code && "rounded-widget border border-primary/15 bg-primary/5 px-2.5 py-2",
      )}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <summary
        title={text}
        className={cn(
          "cursor-pointer list-none break-words leading-5 [&::-webkit-details-marker]:hidden group-open/text:line-clamp-none",
          singleLine || auxiliary ? "line-clamp-1" : "line-clamp-2",
          auxiliary ? "text-xs text-muted-foreground" : "text-sm text-foreground",
          code && "font-mono",
        )}
      >
        {text}
      </summary>
    </details>
  );
}
