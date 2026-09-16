"use client";

import { ChevronDown, ListFilter } from "lucide-react";
import { useId } from "react";
import { GithubIcon, TwitterIcon } from "@/components/site-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SpecialSource, SpecialSources } from "@/models/special-sources";

export function SpecialSourceFilter({
  sources,
  onToggle,
  onReset,
}: {
  sources: SpecialSources;
  onToggle: (source: SpecialSource) => void;
  onReset: () => void;
}) {
  const id = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="特殊来源">
          <ListFilter strokeWidth={1.5} />
          特殊来源
          <ChevronDown strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 space-y-3">
        <p className="text-xs text-muted-foreground">在书签中包含以下来源，选择会自动保存。</p>
        {(
          [
            { source: "github", name: "GitHub", Icon: GithubIcon },
            { source: "x", name: "X（全部内容）", Icon: TwitterIcon },
          ] as const
        ).map(({ source, name, Icon }) => (
          <label
            key={source}
            htmlFor={`${id}-${source}`}
            className="flex min-h-8 cursor-pointer items-center gap-2 text-sm"
          >
            <Checkbox
              id={`${id}-${source}`}
              size="sm"
              checked={sources[source]}
              onCheckedChange={() => onToggle(source)}
              aria-label={name}
            />
            <Icon className="size-4" strokeWidth={1.5} aria-hidden />
            {name}
          </label>
        ))}
        <Button variant="ghost" size="sm" onClick={onReset}>
          恢复默认
        </Button>
      </PopoverContent>
    </Popover>
  );
}
