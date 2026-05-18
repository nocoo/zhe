"use client";

import { useState, useCallback, useEffect } from "react";
import type { Upload } from "@/lib/db/schema";
import type { UploadingFile } from "@/models/upload";
import { formatFileSize, isImageType, DEFAULT_JPEG_QUALITY } from "@/models/upload";
import {
  getUploads as fetchUploads,
  deleteUpload as deleteUploadAction,
} from "@/actions/upload";
import { copyToClipboard } from "@/lib/utils";
import { runUploadFlow } from "./uploads/runUploadFlow";
import { usePersistedFlag, usePersistedNumber } from "./uploads/usePersistedSetting";

// Re-export for component convenience
export { formatFileSize, isImageType };

const AUTO_CONVERT_PNG_KEY = "autoConvertPng";
const JPEG_QUALITY_KEY = "jpegQuality";

/** ViewModel for the uploads list page — fetches data client-side on mount */
export function useUploadsViewModel(initialUploads?: Upload[]) {
  const [uploads, setUploads] = useState<Upload[]>(initialUploads ?? []);
  const [loading, setLoading] = useState(!initialUploads);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoConvertPng, setAutoConvertPng] = usePersistedFlag(AUTO_CONVERT_PNG_KEY, false);
  const [jpegQuality, setJpegQuality] = usePersistedNumber(JPEG_QUALITY_KEY, DEFAULT_JPEG_QUALITY);

  useEffect(() => {
    if (initialUploads) return;

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
  }, [initialUploads]);

  /** Upload a single file (see runUploadFlow for the multi-step flow). */
  const uploadFile = useCallback(
    async (file: File) => {
      await runUploadFlow(
        file,
        { autoConvertPng, jpegQuality },
        { setUploadingFiles, setUploads },
      );
    },
    [autoConvertPng, jpegQuality],
  );

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
    jpegQuality,
    setJpegQuality,
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
