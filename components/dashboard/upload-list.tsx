"use client";

import { Upload as UploadIcon } from "lucide-react";
import { UploadZone } from "./upload-zone";
import { UploadItem, UploadingItem } from "./upload-item";
import { useUploadsViewModel } from "@/viewmodels/useUploadViewModel";
import type { Upload } from "@/lib/db/schema";

interface UploadListProps {
  initialUploads: Upload[];
}

export function UploadList({ initialUploads }: UploadListProps) {
  const {
    uploads,
    uploadingFiles,
    isDragOver,
    setIsDragOver,
    handleFiles,
    handleDelete,
    dismissUploadingFile,
  } = useUploadsViewModel(initialUploads);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">图床</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            共 {uploads.length} 个文件
          </p>
        </div>
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
