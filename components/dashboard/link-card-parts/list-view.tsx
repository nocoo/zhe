"use client";

import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Description, type LinkPreviewProps, SourceLinks, TitleRow } from "./shared-rows";

export function ListView(props: LinkPreviewProps) {
  const image = props.screenshotUrl || props.faviconUrl;
  return (
    <div className="flex h-28 min-w-0 items-center gap-3 p-3">
      <a
        href={props.link.originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="打开原链接"
        className="hidden h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-widget border border-border/60 bg-accent sm:flex"
      >
        {image ? (
          <Image
            src={image}
            alt="链接预览"
            width={112}
            height={80}
            className="h-full w-full object-contain"
            unoptimized
          />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </a>
      <div className="min-w-0 flex-1 space-y-1">
        <TitleRow {...props} />
        <SourceLinks link={props.link} shortUrl={props.shortUrl} />
        {props.onOpenDetails ? (
          <Button
            variant="ghost"
            size="sm"
            className="max-w-full justify-start px-0"
            onClick={props.onOpenDetails}
          >
            查看帖子详情
          </Button>
        ) : (
          <Description link={props.link} />
        )}
      </div>
    </div>
  );
}
