"use client";

import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { XIcon } from "@/components/x-icon";
import { Description, type LinkPreviewProps, SourceLinks, TitleRow } from "./shared-rows";

export function GridView(props: LinkPreviewProps) {
  const image = props.screenshotUrl || props.faviconUrl;
  const preview = image ? (
    <Image
      src={image}
      alt="链接预览"
      fill
      className={props.screenshotUrl ? "object-cover object-top" : "object-contain p-10"}
      unoptimized
    />
  ) : props.onOpenDetails ? (
    <XIcon className="size-10 text-muted-foreground" />
  ) : (
    <ImageIcon className="size-8 text-muted-foreground" />
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {props.onOpenDetails ? (
        <Button
          variant="ghost"
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-none border-b border-border/60 bg-accent p-0"
          onClick={props.onOpenDetails}
          aria-label="查看帖子详情"
        >
          {preview}
        </Button>
      ) : (
        <a
          href={props.link.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="打开原链接"
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden border-b border-border/60 bg-accent"
        >
          {preview}
        </a>
      )}
      <div className="shrink-0 space-y-1 p-3">
        <TitleRow {...props} />
        <SourceLinks link={props.link} shortUrl={props.shortUrl} />
        <Description link={props.link} />
      </div>
    </div>
  );
}
