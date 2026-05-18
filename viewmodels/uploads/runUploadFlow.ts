"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Upload } from "@/lib/db/schema";
import type { UploadingFile } from "@/models/upload";
import { validateUploadRequest, isPngFile, convertPngToJpeg, normalizeJpegQuality } from "@/models/upload";
import { getPresignedUploadUrl, recordUpload } from "@/actions/upload";

interface FlowSetters {
  setUploadingFiles: Dispatch<SetStateAction<UploadingFile[]>>;
  setUploads: Dispatch<SetStateAction<Upload[]>>;
}

interface ConvertSettings {
  autoConvertPng: boolean;
  jpegQuality: number;
}

/** Update a single uploading file entry by tempId. */
function patchUploading(
  setUploadingFiles: Dispatch<SetStateAction<UploadingFile[]>>,
  tempId: string,
  patch: Partial<UploadingFile>,
) {
  setUploadingFiles((prev) =>
    prev.map((f) => (f.id === tempId ? { ...f, ...patch } : f)),
  );
}

function markError(
  setUploadingFiles: Dispatch<SetStateAction<UploadingFile[]>>,
  tempId: string,
  error: string,
) {
  patchUploading(setUploadingFiles, tempId, { status: "error", error });
}

async function maybeConvertPng(file: File, settings: ConvertSettings): Promise<File> {
  if (!settings.autoConvertPng || !isPngFile(file)) return file;
  try {
    return await convertPngToJpeg(file, normalizeJpegQuality(settings.jpegQuality));
  } catch {
    return file;
  }
}

async function putToR2(uploadUrl: string, file: File): Promise<void> {
  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putResponse.ok) {
    throw new Error(`Upload failed with status ${putResponse.status}`);
  }
}

/**
 * Upload a single file via presigned URL flow:
 * 1. Convert PNG→JPEG (optional) → 2. Validate → 3. Get presigned URL →
 * 4. PUT to R2 → 5. Record in DB → 6. Cleanup uploading entry
 */
export async function runUploadFlow(
  file: File,
  settings: ConvertSettings,
  { setUploadingFiles, setUploads }: FlowSetters,
): Promise<void> {
  const tempId = crypto.randomUUID();
  const initial: UploadingFile = {
    id: tempId,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    status: "pending",
    progress: 0,
  };
  setUploadingFiles((prev) => [initial, ...prev]);

  const fileToUpload = await maybeConvertPng(file, settings);

  // Validate
  const validation = validateUploadRequest({
    fileName: fileToUpload.name,
    fileType: fileToUpload.type,
    fileSize: fileToUpload.size,
  });
  if (!validation.valid) {
    markError(setUploadingFiles, tempId, validation.error);
    return;
  }

  // Get presigned URL
  patchUploading(setUploadingFiles, tempId, { status: "uploading", progress: 10 });
  const presignResult = await getPresignedUploadUrl({
    fileName: fileToUpload.name,
    fileType: fileToUpload.type,
    fileSize: fileToUpload.size,
  });
  if (!presignResult.success || !presignResult.data) {
    markError(setUploadingFiles, tempId, presignResult.error || "Failed to get upload URL");
    return;
  }
  const { uploadUrl, publicUrl, key } = presignResult.data;

  // PUT to R2
  patchUploading(setUploadingFiles, tempId, { progress: 30, key, publicUrl });
  try {
    await putToR2(uploadUrl, fileToUpload);
  } catch (error) {
    markError(
      setUploadingFiles,
      tempId,
      error instanceof Error ? error.message : "Upload failed",
    );
    return;
  }

  // Record in DB
  patchUploading(setUploadingFiles, tempId, { progress: 80 });
  const recordResult = await recordUpload({
    key,
    fileName: fileToUpload.name,
    fileType: fileToUpload.type,
    fileSize: fileToUpload.size,
    publicUrl,
  });
  if (!recordResult.success || !recordResult.data) {
    markError(setUploadingFiles, tempId, recordResult.error || "Failed to record upload");
    return;
  }

  // Success
  const uploadData = recordResult.data;
  setUploads((prev) => [uploadData, ...prev]);
  patchUploading(setUploadingFiles, tempId, {
    status: "success",
    progress: 100,
    publicUrl,
  });
  setTimeout(() => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== tempId));
  }, 2000);
}
