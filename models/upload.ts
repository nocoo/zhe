// Pure business logic for upload operations — no React, no server dependencies.

/**
 * Image MIME types — used only for UI display logic (e.g. icon selection),
 * NOT for upload validation. All file types are accepted.
 */
export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
] as const;

/** Maximum file size in bytes (10 MB). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Default JPEG quality for PNG-to-JPG conversion (1–100 scale). */
export const DEFAULT_JPEG_QUALITY = 90;

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

/** Check whether a file is a PNG based on its MIME type. */
export function isPngFile(file: { type: string }): boolean {
  return file.type === 'image/png';
}

/**
 * Replace (or append) the file extension in a filename.
 * If the filename has no extension or ends with a dot, the new extension is appended.
 */
export function replaceExtension(fileName: string, newExt: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return `${fileName}.${newExt}`;
  return `${fileName.slice(0, lastDot)}.${newExt}`;
}

/**
 * Convert a PNG File to JPEG using the Canvas API.
 * Returns a new File with JPEG data, updated name (.jpg), and image/jpeg type.
 * Quality is 0.92 (Canvas default for JPEG).
 */
export function convertPngToJpeg(
  file: File,
  quality = 0.92,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas 2d context'));
        return;
      }

      // JPEG has no alpha — fill white background, then draw image
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error('Canvas toBlob returned null'));
            return;
          }
          const jpegName = replaceExtension(file.name, 'jpg');
          resolve(new File([blob], jpegName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for PNG to JPEG conversion'));
    };

    img.src = url;
  });
}

/**
 * Normalize a JPEG quality percentage (1–100) to a 0–1 value for the Canvas API.
 * Clamps to [1, 100] and floors fractional input before dividing by 100.
 */
export function normalizeJpegQuality(percent: number): number {
  const clamped = Math.max(1, Math.min(100, Math.floor(percent)));
  return clamped / 100;
}

/** Check whether a MIME type is an image type. */
export function isImageType(fileType: string): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(fileType);
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
