"use client";

import { ExternalLink, File, FileText, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBytes, getFileCategory, getFileName } from "@/models/storage";
import type { StorageFile } from "@/models/storage";

function FileIcon({ fileKey }: { fileKey: string }) {
  const category = getFileCategory(fileKey);
  if (category === "image") {
    return <ImageIcon className="h-3.5 w-3.5 text-info shrink-0" strokeWidth={1.5} />;
  }
  if (category === "document") {
    return <FileText className="h-3.5 w-3.5 text-warning shrink-0" strokeWidth={1.5} />;
  }
  return <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />;
}

interface R2FileRowProps {
  file: StorageFile;
  selected: boolean;
  onToggle: () => void;
}

export function R2FileRow({ file, selected, onToggle }: R2FileRowProps) {
  const isOrphan = !file.isReferenced;
  const isImage = getFileCategory(file.key) === "image";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 border-b border-border last:border-b-0 hover:bg-background/50 transition-colors",
        isOrphan && "bg-warning/5",
      )}
    >
      {isOrphan ? (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${getFileName(file.key)}`}
        />
      ) : (
        <span className="w-4 shrink-0" />
      )}

      {isImage && file.publicUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={file.publicUrl}
          alt={getFileName(file.key)}
          className="h-8 w-8 rounded object-cover shrink-0 bg-secondary"
          loading="lazy"
        />
      ) : (
        <div className="h-8 w-8 rounded bg-secondary flex items-center justify-center shrink-0">
          <FileIcon fileKey={file.key} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono text-foreground truncate">
          {getFileName(file.key)}
        </p>
        <p className="text-xs text-muted-foreground truncate">{file.key}</p>
      </div>

      <span className="text-xs font-mono text-muted-foreground shrink-0">
        {formatBytes(file.size)}
      </span>

      {isOrphan ? (
        <Badge variant="warning" className="text-[10px] shrink-0">orphan</Badge>
      ) : (
        <Badge variant="success" className="text-[10px] shrink-0">linked</Badge>
      )}

      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
        <a
          href={`https://s.zhe.to/${file.key}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`打开 ${getFileName(file.key)}`}
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
        </a>
      </Button>
    </div>
  );
}
