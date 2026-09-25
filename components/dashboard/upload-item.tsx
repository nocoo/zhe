"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useDialogReturnFocus } from "@/hooks/use-dialog-return-focus";
import type { Upload } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import type { UploadingFile } from "@/models/upload";
import {
  formatFileSize,
  isImageType,
  useUploadItemViewModel,
} from "@/viewmodels/useUploadViewModel";
import { CardActions } from "./card-actions";

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
  open,
  onOpenChange,
}: {
  isDeleting: boolean;
  onDelete: () => void;
  archived: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const focusReturn = useDialogReturnFocus();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent {...focusReturn}>
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

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState(false);
  const previewFocusReturn = useDialogReturnFocus();
  const isImage = isImageType(upload.fileType);
  const isVideo = upload.fileType.startsWith("video/");

  return (
    <LayerCard
      data-testid="upload-item"
      data-card-actions-container
      padding="none"
      className="rounded-card p-4 shadow-card ring-1 ring-border/40"
    >
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 break-all text-xs text-muted-foreground">
              <span>{formatFileSize(upload.fileSize)}</span>
              <span>{upload.fileType}</span>
              <span>{formatDate(upload.createdAt)}</span>
            </div>
          </div>
        </div>

        <CardActions
          primary={
            <Button
              variant="ghost"
              size="sm"
              className="w-8 px-0"
              onClick={(event) => {
                if (isVideo) {
                  event.currentTarget.focus();
                  setPreview(true);
                } else handleCopy();
              }}
              aria-label={isVideo ? "预览视频" : "Copy link"}
              title={isVideo ? "预览视频" : "复制链接"}
            >
              {isVideo ? (
                <Video aria-hidden />
              ) : copied ? (
                <Check className="text-success" aria-hidden />
              ) : (
                <Copy aria-hidden />
              )}
            </Button>
          }
          secondary={[
            ...(isVideo
              ? [{ label: "Copy link", icon: copied ? Check : Copy, onSelect: handleCopy }]
              : []),
            {
              label: "Delete file",
              icon: Trash2,
              destructive: true,
              disabled: isDeleting,
              onSelect: () => setConfirmDelete(true),
            },
          ]}
          menuItems={
            <DropdownMenuItem asChild>
              <a href={upload.publicUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                在新标签页打开
              </a>
            </DropdownMenuItem>
          }
        />
        <DeleteUploadDialog
          isDeleting={isDeleting}
          onDelete={handleDelete}
          archived={upload.key.split("/")[1] === "x"}
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
        />
        {isVideo && (
          <Dialog open={preview} onOpenChange={setPreview}>
            <DialogContent size="xl" {...previewFocusReturn}>
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
    <LayerCard
      data-testid="uploading-item"
      padding="none"
      className="rounded-card p-4 shadow-card ring-1 ring-border/40"
    >
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
