"use client";

import { useState, useCallback, useEffect } from "react";
import type { Upload } from "@/lib/db/schema";
import type { UploadingFile } from "@/models/upload";
import { validateUploadRequest } from "@/models/upload";
import { formatFileSize, isImageType, isPngFile, convertPngToJpeg } from "@/models/upload";
import {
  getPresignedUploadUrl,
  recordUpload,
  getUploads as fetchUploads,
  deleteUpload as deleteUploadAction,
} from "@/actions/upload";
import { copyToClipboard } from "@/lib/utils";

// Re-export for component convenience
export { formatFileSize, isImageType };

/** ViewModel for the uploads list page — fetches data client-side on mount */
export function useUploadsViewModel() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoConvertPng, setAutoConvertPng] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const result = await fetchUploads();
      if (cancelled) return;
      if (result.success && result.data) {
        setUploads(result.data);
      }
      setLoading(false);
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  /**
   * Upload a single file via presigned URL flow:
   * 1. Validate → 2. Get presigned URL → 3. PUT to R2 → 4. Record in DB
   */
  const uploadFile = useCallback(async (file: File) => {
    const tempId = crypto.randomUUID();
    const uploadingFile: UploadingFile = {
      id: tempId,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      status: "pending",
      progress: 0,
    };

    // Add to uploading list
    setUploadingFiles((prev) => [uploadingFile, ...prev]);

    // Step 0: Convert PNG to JPEG if enabled
    let fileToUpload = file;
    if (autoConvertPng && isPngFile(file)) {
      try {
        fileToUpload = await convertPngToJpeg(file);
      } catch {
        // Fall back to original file on conversion failure
        fileToUpload = file;
      }
    }

    // Step 1: Validate
    const validation = validateUploadRequest({
      fileName: fileToUpload.name,
      fileType: fileToUpload.type,
      fileSize: fileToUpload.size,
    });

    if (!validation.valid) {
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.id === tempId
            ? { ...f, status: "error" as const, error: validation.error }
            : f,
        ),
      );
      return;
    }

    // Step 2: Get presigned URL
    setUploadingFiles((prev) =>
      prev.map((f) =>
        f.id === tempId ? { ...f, status: "uploading" as const, progress: 10 } : f,
      ),
    );

    const presignResult = await getPresignedUploadUrl({
      fileName: fileToUpload.name,
      fileType: fileToUpload.type,
      fileSize: fileToUpload.size,
    });

    if (!presignResult.success || !presignResult.data) {
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.id === tempId
            ? { ...f, status: "error" as const, error: presignResult.error || "Failed to get upload URL" }
            : f,
        ),
      );
      return;
    }

    const { uploadUrl, publicUrl, key } = presignResult.data;

    // Step 3: PUT file to R2 via presigned URL
    setUploadingFiles((prev) =>
      prev.map((f) =>
        f.id === tempId ? { ...f, progress: 30, key, publicUrl } : f,
      ),
    );

    try {
      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: fileToUpload,
        headers: { "Content-Type": fileToUpload.type },
      });

      if (!putResponse.ok) {
        throw new Error(`Upload failed with status ${putResponse.status}`);
      }
    } catch (error) {
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.id === tempId
            ? {
                ...f,
                status: "error" as const,
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : f,
        ),
      );
      return;
    }

    // Step 4: Record in DB
    setUploadingFiles((prev) =>
      prev.map((f) =>
        f.id === tempId ? { ...f, progress: 80 } : f,
      ),
    );

    const recordResult = await recordUpload({
      key,
      fileName: fileToUpload.name,
      fileType: fileToUpload.type,
      fileSize: fileToUpload.size,
      publicUrl,
    });

    if (!recordResult.success || !recordResult.data) {
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.id === tempId
            ? {
                ...f,
                status: "error" as const,
                error: recordResult.error || "Failed to record upload",
              }
            : f,
        ),
      );
      return;
    }

    // Success: add to uploads list and mark as complete
    setUploads((prev) => [recordResult.data!, ...prev]);
    setUploadingFiles((prev) =>
      prev.map((f) =>
        f.id === tempId
          ? { ...f, status: "success" as const, progress: 100, publicUrl }
          : f,
      ),
    );

    // Remove from uploading list after a short delay
    setTimeout(() => {
      setUploadingFiles((prev) => prev.filter((f) => f.id !== tempId));
    }, 2000);
  }, [autoConvertPng]);

  /** Handle multiple files from input or drop */
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        uploadFile(file);
      }
    },
    [uploadFile],
  );

  /** Delete an upload from R2 + DB */
  const handleDelete = useCallback(async (uploadId: number) => {
    const result = await deleteUploadAction(uploadId);
    if (result.success) {
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      return true;
    }
    return false;
  }, []);

  /** Refresh uploads from server */
  const refreshUploads = useCallback(async () => {
    const result = await fetchUploads();
    if (result.success && result.data) {
      setUploads(result.data);
    }
  }, []);

  /** Dismiss a failed upload from the uploading list */
  const dismissUploadingFile = useCallback((tempId: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== tempId));
  }, []);

  return {
    uploads,
    loading,
    uploadingFiles,
    isDragOver,
    setIsDragOver,
    autoConvertPng,
    setAutoConvertPng,
    handleFiles,
    handleDelete,
    refreshUploads,
    dismissUploadingFile,
  };
}

/** ViewModel for a single upload item — manages copy and delete */
export function useUploadItemViewModel(
  upload: Upload,
  onDelete: (id: number) => Promise<boolean>,
) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(upload.publicUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [upload.publicUrl]);

  const handleDelete = useCallback(async () => {
    if (!confirm("确定要删除这个文件吗？删除后无法恢复。")) return;
    setIsDeleting(true);
    const success = await onDelete(upload.id);
    if (!success) {
      alert("删除失败，请重试");
    }
    setIsDeleting(false);
  }, [upload.id, onDelete]);

  return {
    copied,
    isDeleting,
    handleCopy,
    handleDelete,
  };
}
