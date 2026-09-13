"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  LayerCard,
} from "@nocoo/basalt";
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Upload } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import type { UploadingFile } from "@/models/upload";
import {
  formatFileSize,
  isImageType,
  useUploadItemViewModel,
} from "@/viewmodels/useUploadViewModel";

// ---------------------------------------------------------------------------
// UploadItem — a completed upload in the list
// ---------------------------------------------------------------------------

interface UploadItemProps {
  upload: Upload;
  onDelete: (id: number) => Promise<boolean>;
}

function DeleteUploadDialog({
  isDeleting,
  onDelete,
  archived,
}: {
  isDeleting: boolean;
  onDelete: () => void;
  archived: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Delete file" disabled={isDeleting}>
          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>此操作不可撤销，确定要删除这个文件吗？</AlertDialogDescription>
          {archived && (
            <p className="text-sm text-muted-foreground">
              书签中的此附件也会移除；删除视频时会一起清理海报。
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            data-testid="upload-delete-confirm"
            onClick={onDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "删除中..." : "删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UploadItem({ upload, onDelete }: UploadItemProps) {
  const { copied, isDeleting, handleCopy, handleDelete } = useUploadItemViewModel(upload, onDelete);

  const isImage = isImageType(upload.fileType);
  const isVideo = upload.fileType.startsWith("video/");

  return (
    <LayerCard data-testid="upload-item" padding="none" className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* File type icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
            {isVideo ? (
              <Video className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            ) : isImage ? (
              <ImageIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* File name */}
            <p
              data-testid="upload-file-name"
              className="text-sm font-medium text-foreground truncate"
            >
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
          {isVideo && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="预览视频">
                  <Video className="size-4" strokeWidth={1.5} />
                </Button>
              </DialogTrigger>
              <DialogContent size="xl">
                <DialogHeader>
                  <DialogTitle>{upload.fileName}</DialogTitle>
                  <DialogDescription>已保存在您的 Zhe 存储</DialogDescription>
                </DialogHeader>
                <video
                  src={upload.publicUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="文件视频预览"
                  className="max-h-[70dvh] w-full rounded-widget bg-black"
                >
                  <track kind="captions" />
                </video>
              </DialogContent>
            </Dialog>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            aria-label="Copy link"
            title="复制链接"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" strokeWidth={1.5} />
            ) : (
              <Copy className="w-4 h-4" strokeWidth={1.5} />
            )}
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a
              href={upload.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="在新标签页打开"
              aria-label="在新标签页打开"
            >
              <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
            </a>
          </Button>
          <DeleteUploadDialog
            isDeleting={isDeleting}
            onDelete={handleDelete}
            archived={upload.key.split("/")[1] === "x"}
          />
        </div>
      </div>
    </LayerCard>
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
    <LayerCard data-testid="uploading-item" padding="none" className="p-4">
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
            <p className="text-sm font-medium text-foreground truncate">{file.fileName}</p>
            {file.status === "error" && file.error && (
              <p className="text-xs text-destructive mt-0.5">{file.error}</p>
            )}
            {(file.status === "uploading" || file.status === "pending") && (
              <div className="mt-2 h-1 w-full rounded-full bg-accent overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-[var(--motion-base)]"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            )}
            {file.status === "success" && <p className="text-xs text-success mt-0.5">上传成功</p>}
          </div>
        </div>

        {/* Dismiss for errors */}
        {file.status === "error" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDismiss(file.id)}
            aria-label="Dismiss"
            title="关闭"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        )}
      </div>
    </LayerCard>
  );
}
