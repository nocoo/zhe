"use client";

import { Upload as UploadIcon } from "lucide-react";
import { UploadZone } from "./upload-zone";
import { UploadItem, UploadingItem } from "./upload-item";
import { useUploadsViewModel } from "@/viewmodels/useUploadViewModel";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

function UploadListSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 w-16 rounded bg-muted" />
          <div className="h-4 w-20 rounded bg-muted mt-1.5" />
        </div>
      </div>

      {/* Upload zone skeleton */}
      <div className="mb-6">
        <div className="h-32 rounded-[14px] border-2 border-dashed border-muted bg-secondary" />
      </div>

      {/* Upload item skeletons */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[14px] bg-secondary p-4 flex items-center gap-4"
          >
            <div className="h-12 w-12 rounded-lg bg-muted shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
            <div className="h-8 w-16 rounded bg-muted shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function UploadList() {
  const {
    uploads,
    loading,
    uploadingFiles,
    isDragOver,
    setIsDragOver,
    autoConvertPng,
    setAutoConvertPng,
    jpegQuality,
    setJpegQuality,
    handleFiles,
    handleDelete,
    dismissUploadingFile,
  } = useUploadsViewModel();

  if (loading) {
    return <UploadListSkeleton />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">图片管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            共 {uploads.length} 个文件
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Switch
            id="auto-convert-png"
            checked={autoConvertPng}
            onCheckedChange={setAutoConvertPng}
          />
          <Label
            htmlFor="auto-convert-png"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            PNG 自动转 JPG
          </Label>
        </div>
        {autoConvertPng && (
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">
              质量
            </Label>
            <Slider
              value={[jpegQuality]}
              onValueChange={([v]) => setJpegQuality(v)}
              min={1}
              max={100}
              step={1}
              className="w-28"
              aria-label="JPG 质量"
            />
            <span className="text-sm text-muted-foreground tabular-nums w-8 text-right">
              {jpegQuality}
            </span>
          </div>
        )}
      </div>

      {/* Upload zone */}
      <div className="mb-6">
        <UploadZone
          isDragOver={isDragOver}
          onDragOver={setIsDragOver}
          onFiles={handleFiles}
        />
      </div>

      {/* Uploading files (in-progress / errors) */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2 mb-4">
          {uploadingFiles.map((file) => (
            <UploadingItem
              key={file.id}
              file={file}
              onDismiss={dismissUploadingFile}
            />
          ))}
        </div>
      )}

      {/* Completed uploads */}
      {uploads.length === 0 && uploadingFiles.length === 0 ? (
        <div className="rounded-[14px] border-0 bg-secondary shadow-none p-12 text-center">
          <UploadIcon
            className="w-10 h-10 mx-auto text-muted-foreground mb-4"
            strokeWidth={1.5}
          />
          <p className="text-sm text-muted-foreground mb-2">暂无文件</p>
          <p className="text-xs text-muted-foreground">
            拖拽文件到上方区域或点击选择文件上传
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <UploadItem
              key={upload.id}
              upload={upload}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
