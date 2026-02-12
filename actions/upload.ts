'use server';

import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';
import { createPresignedUploadUrl } from '@/lib/r2/client';
import { deleteR2Object } from '@/lib/r2/client';
import {
  validateUploadRequest,
  generateObjectKey,
  buildPublicUrl,
} from '@/models/upload';
import type { UploadRequest, PresignedUrlResponse } from '@/models/upload';
import type { Upload } from '@/lib/db/schema';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get a ScopedDB instance for the current authenticated user.
 * Returns null if not authenticated.
 */
async function getScopedDB(): Promise<ScopedDB | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return new ScopedDB(userId);
}

/**
 * Generate a presigned URL for uploading a file directly to R2.
 */
export async function getPresignedUploadUrl(
  request: UploadRequest,
): Promise<ActionResult<PresignedUrlResponse>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate the upload request
    const validation = validateUploadRequest(request);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Generate object key: YYYYMMDD/uuid.ext
    const key = generateObjectKey(request.fileName);

    // Build public URL
    const publicDomain = process.env.R2_PUBLIC_DOMAIN;
    if (!publicDomain) {
      return { success: false, error: 'R2 public domain not configured' };
    }
    const publicUrl = buildPublicUrl(publicDomain, key);

    // Generate presigned PUT URL
    const uploadUrl = await createPresignedUploadUrl(key, request.fileType);

    return {
      success: true,
      data: { uploadUrl, publicUrl, key },
    };
  } catch (error) {
    console.error('Failed to generate presigned URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate upload URL',
    };
  }
}

/**
 * Record a completed upload in the database.
 */
export async function recordUpload(data: {
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  publicUrl: string;
}): Promise<ActionResult<Upload>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const upload = await db.createUpload({
      key: data.key,
      fileName: data.fileName,
      fileType: data.fileType,
      fileSize: data.fileSize,
      publicUrl: data.publicUrl,
    });

    return { success: true, data: upload };
  } catch (error) {
    console.error('Failed to record upload:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record upload',
    };
  }
}

/**
 * Get all uploads for the current user.
 */
export async function getUploads(): Promise<ActionResult<Upload[]>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const uploads = await db.getUploads();
    return { success: true, data: uploads };
  } catch (error) {
    console.error('Failed to get uploads:', error);
    return { success: false, error: 'Failed to get uploads' };
  }
}

/**
 * Delete an upload — removes from both R2 and D1.
 */
export async function deleteUpload(uploadId: number): Promise<ActionResult> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    // Get the R2 key first (with ownership check)
    const key = await db.getUploadKey(uploadId);
    if (!key) {
      return { success: false, error: 'Upload not found or access denied' };
    }

    // Delete from R2
    await deleteR2Object(key);

    // Delete from D1
    await db.deleteUpload(uploadId);

    return { success: true };
  } catch (error) {
    console.error('Failed to delete upload:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete upload',
    };
  }
}
