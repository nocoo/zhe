"use client";

import {
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/lib/utils";
import { useUploadItemViewModel, formatFileSize, isImageType } from "@/viewmodels/useUploadViewModel";
import type { Upload } from "@/lib/db/schema";
import type { UploadingFile } from "@/models/upload";

// ---------------------------------------------------------------------------
// UploadItem — a completed upload in the list
// ---------------------------------------------------------------------------

interface UploadItemProps {
  upload: Upload;
  onDelete: (id: number) => Promise<boolean>;
}

export function UploadItem({ upload, onDelete }: UploadItemProps) {
  const { copied, isDeleting, handleCopy, handleDelete } =
    useUploadItemViewModel(upload, onDelete);

  const isImage = isImageType(upload.fileType);

  return (
    <div className="rounded-[14px] border-0 bg-secondary shadow-none p-4 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* File type icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
            {isImage ? (
              <ImageIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* File name */}
            <p className="text-sm font-medium text-foreground truncate">
              {upload.fileName}
            </p>

            {/* Public URL */}
            <a
              href={upload.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground truncate block"
            >
              {upload.publicUrl}
            </a>

            {/* Meta row */}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>{formatFileSize(upload.fileSize)}</span>
              <span>{upload.fileType}</span>
              <span>{formatDate(upload.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCopy}
            aria-label="Copy link"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="复制链接"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" strokeWidth={1.5} />
            ) : (
              <Copy className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
          <a
            href={upload.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="在新标签页打开"
          >
            <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
          </a>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                aria-label="Delete file"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除</AlertDialogTitle>
                <AlertDialogDescription>
                  此操作不可撤销，确定要删除这个文件吗？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "删除中..." : "删除"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UploadingItem — a file currently being uploaded
// ---------------------------------------------------------------------------

interface UploadingItemProps {
  file: UploadingFile;
  onDismiss: (id: string) => void;
}

export function UploadingItem({ file, onDismiss }: UploadingItemProps) {
  return (
    <div className="rounded-[14px] border-0 bg-secondary shadow-none p-4 transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Status icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
            {file.status === "uploading" || file.status === "pending" ? (
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" strokeWidth={1.5} />
            ) : file.status === "success" ? (
              <Check className="h-5 w-5 text-success" strokeWidth={1.5} />
            ) : (
              <X className="h-5 w-5 text-destructive" strokeWidth={1.5} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {file.fileName}
            </p>
            {file.status === "error" && file.error && (
              <p className="text-xs text-destructive mt-0.5">{file.error}</p>
            )}
            {(file.status === "uploading" || file.status === "pending") && (
              <div className="mt-2 h-1 w-full rounded-full bg-accent overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            )}
            {file.status === "success" && (
              <p className="text-xs text-success mt-0.5">上传成功</p>
            )}
          </div>
        </div>

        {/* Dismiss for errors */}
        {file.status === "error" && (
          <button
            onClick={() => onDismiss(file.id)}
            aria-label="Dismiss"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
