"use client";

import { FileUp } from "lucide-react";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  isDragOver: boolean;
  onDragOver: (over: boolean) => void;
  onFiles: (files: FileList | File[]) => void;
  disabled?: boolean;
}

export function UploadZone({ isDragOver, onDragOver, onFiles, disabled }: UploadZoneProps) {
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
    <div className={cn(disabled && "pointer-events-none opacity-50")}>
      {/* File input is a sibling of the button so the button content stays phrasing-valid. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleChange}
        className="hidden"
        data-testid="upload-input"
        disabled={disabled}
        tabIndex={-1}
      />
      <button
        type="button"
        data-testid="upload-zone"
        disabled={disabled}
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
          "relative flex w-full flex-col items-center justify-center rounded-card border-2 border-dashed p-8 transition-all cursor-pointer",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/20 bg-secondary hover:border-muted-foreground/40",
        )}
      >
        <span className="mb-3 flex items-center gap-2">
          <FileUp className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
        </span>
        <span className="mb-1 text-sm font-medium text-foreground">
          {isDragOver ? "释放文件以上传" : "拖拽文件到此处，或点击选择"}
        </span>
        <span className="text-xs text-muted-foreground">支持所有文件类型，最大 10MB</span>
      </button>
    </div>
  );
}
