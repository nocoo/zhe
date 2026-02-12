// Pure business logic for upload operations — no React, no server dependencies.

/**
 * Allowed MIME types for image uploads.
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
] as const;

/**
 * Allowed MIME types for document uploads.
 */
export const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/plain',
] as const;

/**
 * All allowed MIME types.
 */
export const ALLOWED_TYPES: readonly string[] = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOC_TYPES,
];

/** Maximum file size in bytes (10 MB). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ============================================
// Types
// ============================================

/** Request payload for obtaining a presigned upload URL. */
export interface UploadRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
}

/** Response from the presigned URL generation endpoint. */
export interface PresignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

/** A file currently being uploaded (client-side state). */
export interface UploadingFile {
  /** Temporary client-side ID. */
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  /** Upload progress 0–100. */
  progress: number;
  publicUrl?: string;
  key?: string;
  error?: string;
}

// ============================================
// Pure functions
// ============================================

/**
 * Hash a userId with a salt for use as an R2 folder prefix.
 * Uses SHA-256, returns first 12 hex characters.
 * This prevents exposing real userIds in public R2 URLs.
 */
export async function hashUserId(
  userId: string,
  salt: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${userId}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 12);
}

/** Validate an upload request. Returns `{ valid: true }` or `{ valid: false, error }`. */
export function validateUploadRequest(
  req: UploadRequest,
): { valid: true } | { valid: false; error: string } {
  if (!req.fileName || !req.fileType || !req.fileSize) {
    return { valid: false, error: 'Missing required fields' };
  }

  if (!ALLOWED_TYPES.includes(req.fileType)) {
    return { valid: false, error: `File type ${req.fileType} is not allowed` };
  }

  if (req.fileSize <= 0) {
    return { valid: false, error: 'File size must be greater than 0' };
  }

  if (req.fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    };
  }

  return { valid: true };
}

/**
 * Extract the file extension from a filename.
 * Returns lowercase extension without the dot, or empty string if none.
 */
export function extractExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileName.length - 1) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Generate an R2 object key: `{userHash}/YYYYMMDD/{uuid}.{ext}`.
 *
 * - User hash prefix for per-user folder isolation (salted, not reversible).
 * - Date folder uses UTC.
 * - UUID via `crypto.randomUUID()`.
 * - Extension extracted from the original filename.
 */
export function generateObjectKey(fileName: string, userHash: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const dateFolder = `${y}${m}${d}`;

  const uuid = crypto.randomUUID();
  const ext = extractExtension(fileName);

  return ext
    ? `${userHash}/${dateFolder}/${uuid}.${ext}`
    : `${userHash}/${dateFolder}/${uuid}`;
}

/** Build the full public URL from the R2 public domain and object key. */
export function buildPublicUrl(publicDomain: string, key: string): string {
  return `${publicDomain.replace(/\/$/, '')}/${key}`;
}

/** Check whether a MIME type is an image type. */
export function isImageType(fileType: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(fileType);
}

/** Format bytes into a human-readable string (e.g. "1.5 MB"). */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
