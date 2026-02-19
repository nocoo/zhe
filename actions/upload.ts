'use server';

import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';
import { createPresignedUploadUrl } from '@/lib/r2/client';
import { deleteR2Object } from '@/lib/r2/client';
import {
  validateUploadRequest,
  generateObjectKey,
  buildPublicUrl,
  hashUserId,
} from '@/models/upload';
import type { UploadRequest, PresignedUrlResponse } from '@/models/upload';
import type { Upload } from '@/lib/db/schema';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get a ScopedDB instance and userId for the current authenticated user.
 * Returns null if not authenticated.
 */
async function getAuthContext(): Promise<{ db: ScopedDB; userId: string } | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return { db: new ScopedDB(userId), userId };
}

/**
 * Generate a presigned URL for uploading a file directly to R2.
 */
export async function getPresignedUploadUrl(
  request: UploadRequest,
): Promise<ActionResult<PresignedUrlResponse>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate the upload request
    const validation = validateUploadRequest(request);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Hash userId for R2 folder prefix
    const salt = process.env.R2_USER_HASH_SALT;
    if (!salt) {
      return { success: false, error: 'R2 user hash salt not configured' };
    }
    const userHash = await hashUserId(ctx.userId, salt);

    // Generate object key: {userHash}/YYYYMMDD/uuid.ext
    const key = generateObjectKey(request.fileName, userHash);

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
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate the key belongs to this user's namespace to prevent
    // recording another user's R2 key (which would allow deleting their objects).
    const salt = process.env.R2_USER_HASH_SALT;
    if (!salt) {
      return { success: false, error: 'R2 user hash salt not configured' };
    }
    const userHash = await hashUserId(ctx.userId, salt);
    if (!data.key.startsWith(`${userHash}/`)) {
      return { success: false, error: 'Invalid upload key' };
    }

    const upload = await ctx.db.createUpload({
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
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }

    const uploads = await ctx.db.getUploads();
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
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }

    // Get the R2 key first (with ownership check)
    const key = await ctx.db.getUploadKey(uploadId);
    if (!key) {
      return { success: false, error: 'Upload not found or access denied' };
    }

    // Delete from D1 first (reversible), then R2 (irreversible).
    // If D1 succeeds but R2 fails, we only leave an orphan R2 object
    // (cleanable later) instead of a dangling DB record pointing nowhere.
    await ctx.db.deleteUpload(uploadId);

    // Best-effort R2 cleanup — log but don't fail the user action
    try {
      await deleteR2Object(key);
    } catch (r2Error) {
      console.error('R2 delete failed (orphan object left):', r2Error);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to delete upload:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete upload',
    };
  }
}
