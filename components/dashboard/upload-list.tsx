"use client";

import { Upload as UploadIcon } from "lucide-react";
import { CardListSkeleton } from "@/components/ui/card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { staggerStyle } from "@/lib/motion";
import { useBulkDelete } from "@/viewmodels/useBulkDelete";
import { useUploadsViewModel } from "@/viewmodels/useUploadViewModel";
import { BulkDeleteActions, SelectableCard } from "./bulk-delete";
import { UploadItem, UploadingItem } from "./upload-item";
import { UploadZone } from "./upload-zone";

function UploadListSkeleton() {
  return (
    <div>
      <PageHeader title="文件上传" meta="加载中…" />
      <div className="mb-6 flex items-center gap-4">
        <div className="h-6 w-36 rounded-widget bg-secondary animate-pulse motion-reduce:animate-none" />
      </div>
      <div className="mb-6">
        <div className="h-32 rounded-card border-2 border-dashed border-muted bg-secondary animate-pulse motion-reduce:animate-none" />
      </div>
      <CardListSkeleton rows={4} variant="upload" />
    </div>
  );
}

function UploadOptions({
  autoConvertPng,
  setAutoConvertPng,
  jpegQuality,
  setJpegQuality,
}: {
  autoConvertPng: boolean;
  setAutoConvertPng: (v: boolean) => void;
  jpegQuality: number;
  setJpegQuality: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Switch
          id="auto-convert-png"
          data-testid="png-convert-switch"
          checked={autoConvertPng}
          onCheckedChange={setAutoConvertPng}
        />
        <Label htmlFor="auto-convert-png" className="text-xs text-muted-foreground cursor-pointer">
          PNG 自动转 JPG
        </Label>
      </div>
      {autoConvertPng && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">质量</Label>
          <Slider
            value={[jpegQuality]}
            onValueChange={([v]) => setJpegQuality(v ?? jpegQuality)}
            min={1}
            max={100}
            step={1}
            className="w-24"
            aria-label="JPG 质量"
          />
          <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
            {jpegQuality}
          </span>
        </div>
      )}
    </div>
  );
}

export function UploadList({
  initialUploads,
}: {
  initialUploads?: import("@/lib/db/schema").Upload[];
}) {
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
  } = useUploadsViewModel(initialUploads);

  const selection = useBulkDelete(
    uploads.map((upload) => ({ id: upload.id, label: upload.fileName })),
    async (id) => ({ success: await handleDelete(id) }),
  );

  if (loading) {
    return <UploadListSkeleton />;
  }

  return (
    <div>
      {/* Header */}
      <PageHeader
        title="文件上传"
        meta={<span data-testid="upload-file-count">共 {uploads.length} 个文件</span>}
        actions={
          <>
            <UploadOptions
              autoConvertPng={autoConvertPng}
              setAutoConvertPng={setAutoConvertPng}
              jpegQuality={jpegQuality}
              setJpegQuality={setJpegQuality}
            />
            <BulkDeleteActions selection={selection} />
          </>
        }
      />

      {/* Upload zone */}
      <div className="mb-4">
        <UploadZone isDragOver={isDragOver} onDragOver={setIsDragOver} onFiles={handleFiles} />
      </div>

      {/* Uploading files (in-progress / errors) */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2 mb-4">
          {uploadingFiles.map((file, i) => (
            <div
              key={file.id}
              className="animate-fade-up motion-reduce:animate-none"
              style={staggerStyle(i)}
            >
              <UploadingItem file={file} onDismiss={dismissUploadingFile} />
            </div>
          ))}
        </div>
      )}

      {/* Completed uploads */}
      {uploads.length === 0 && uploadingFiles.length === 0 ? (
        <EmptyState
          icon={UploadIcon}
          title="暂无文件"
          description="拖拽文件到上方区域或点击选择文件上传"
          data-testid="upload-empty-state"
        />
      ) : (
        <div className="space-y-2" data-testid="card-list">
          {uploads.map((upload, i) => (
            <SelectableCard
              selection={selection}
              itemId={upload.id}
              label={upload.fileName}
              key={upload.id}
              className="animate-fade-up motion-reduce:animate-none"
              style={staggerStyle(i)}
            >
              <UploadItem upload={upload} onDelete={handleDelete} />
            </SelectableCard>
          ))}
        </div>
      )}
    </div>
  );
}
