// Pure business logic for storage audit — no React, no server dependencies.

import type { R2Object } from '@/lib/r2/client';

// ============================================
// Types
// ============================================

/** A file in R2 with orphan status. */
export interface StorageFile {
  key: string;
  size: number;
  lastModified: string;
  /** Whether the key is referenced in D1 (uploads table or links.screenshot_url). */
  isReferenced: boolean;
  /** Public URL for preview (images). */
  publicUrl: string;
}

/** Summary statistics for a storage backend. */
export interface StorageSummary {
  totalFiles: number;
  totalSize: number;
  orphanFiles: number;
  orphanSize: number;
}

/** D1 database connectivity and stats. */
export interface D1Stats {
  connected: boolean;
  totalLinks: number;
  totalUploads: number;
  totalAnalytics: number;
  /** Tables and their row counts. */
  tables: { name: string; rows: number }[];
}

/** R2 storage stats with file listing. */
export interface R2Stats {
  connected: boolean;
  summary: StorageSummary;
  /** All files in R2 with orphan status. */
  files: StorageFile[];
}

/** Full storage scan result. */
export interface StorageScanResult {
  d1: D1Stats;
  r2: R2Stats;
}

// ============================================
// Pure functions
// ============================================

/**
 * Determine which R2 objects are orphans by cross-referencing with D1 data.
 *
 * An R2 object is considered "referenced" if:
 * 1. Its key exists in the `uploads` table's `key` column, OR
 * 2. Its key appears as part of any `links.screenshot_url` value
 *
 * @param r2Objects - All objects listed from R2
 * @param uploadKeys - Set of all `key` values from the `uploads` table
 * @param screenshotKeys - Set of R2 keys extracted from `links.screenshot_url` values
 * @param publicDomain - R2 public domain for building preview URLs
 */
export function classifyR2Objects(
  r2Objects: R2Object[],
  uploadKeys: Set<string>,
  screenshotKeys: Set<string>,
  publicDomain: string,
): StorageFile[] {
  return r2Objects.map((obj) => ({
    key: obj.key,
    size: obj.size,
    lastModified: obj.lastModified,
    isReferenced: uploadKeys.has(obj.key) || screenshotKeys.has(obj.key),
    publicUrl: buildPublicUrl(publicDomain, obj.key),
  }));
}

/** Build a public URL from domain and key. */
function buildPublicUrl(domain: string, key: string): string {
  return `${domain.replace(/\/$/, '')}/${key}`;
}

/**
 * Extract the R2 key from a screenshot URL.
 * Screenshot URLs look like: `https://domain.com/{userHash}/YYYYMMDD/{uuid}.ext`
 * We strip the domain prefix to get the key.
 */
export function extractKeyFromUrl(url: string, publicDomain: string): string | null {
  const prefix = publicDomain.replace(/\/$/, '') + '/';
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}

/** Compute summary statistics from classified files. */
export function computeSummary(files: StorageFile[]): StorageSummary {
  let totalSize = 0;
  let orphanFiles = 0;
  let orphanSize = 0;

  for (const file of files) {
    totalSize += file.size;
    if (!file.isReferenced) {
      orphanFiles++;
      orphanSize += file.size;
    }
  }

  return {
    totalFiles: files.length,
    totalSize,
    orphanFiles,
    orphanSize,
  };
}

/** Format bytes into a human-readable string (e.g. "1.5 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Get a display-friendly file name from an R2 key. */
export function getFileName(key: string): string {
  return key.split('/').pop() ?? key;
}

/** Detect file category from MIME type or key extension. */
export function getFileCategory(key: string): 'image' | 'document' | 'other' {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'ico'].includes(ext)) {
    return 'image';
  }
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'json', 'csv'].includes(ext)) {
    return 'document';
  }
  return 'other';
}
