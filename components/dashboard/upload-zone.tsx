"use client";

import { useCallback, useRef } from "react";
import { Upload, ImageIcon, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALLOWED_TYPES } from "@/models/upload";

interface UploadZoneProps {
  isDragOver: boolean;
  onDragOver: (over: boolean) => void;
  onFiles: (files: FileList | File[]) => void;
  disabled?: boolean;
}

export function UploadZone({
  isDragOver,
  onDragOver,
  onFiles,
  disabled,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) onDragOver(true);
    },
    [disabled, onDragOver],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragOver(false);
    },
    [onDragOver],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragOver(false);
      if (!disabled && e.dataTransfer.files.length > 0) {
        onFiles(e.dataTransfer.files);
      }
    },
    [disabled, onDragOver, onFiles],
  );

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFiles(e.target.files);
        // Reset input so the same file can be re-selected
        e.target.value = "";
      }
    },
    [onFiles],
  );

  return (
    <div
      data-testid="upload-zone"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-[14px] border-2 border-dashed p-8 transition-all cursor-pointer",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/20 bg-secondary hover:border-muted-foreground/40",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleChange}
        className="hidden"
        data-testid="upload-input"
      />

      <div className="flex items-center gap-2 mb-3">
        <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
        <ImageIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
        <FileText className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
      </div>

      <p className="text-sm text-foreground font-medium mb-1">
        {isDragOver ? "释放文件以上传" : "拖拽文件到此处，或点击选择"}
      </p>
      <p className="text-xs text-muted-foreground">
        支持图片 (JPEG, PNG, GIF, WebP, SVG, AVIF) 和文档 (PDF, Markdown, TXT)，最大 10MB
      </p>
    </div>
  );
}
