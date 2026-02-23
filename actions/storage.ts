'use server';

import { auth } from '@/auth';
import { executeD1Query } from '@/lib/db/d1-client';
import { listR2Objects, deleteR2Objects } from '@/lib/r2/client';
import {
  classifyR2Objects,
  computeSummary,
  extractKeyFromUrl,
} from '@/models/storage';
import type { StorageScanResult, D1Stats, R2Stats } from '@/models/storage';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Verify the current user is authenticated. */
async function requireAuth(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// ============================================
// D1 Stats
// ============================================

async function getD1Stats(): Promise<D1Stats> {
  try {
    // Count rows in core tables
    const [linkRows, uploadRows, analyticsRows, folderRows, tagRows, webhookRows] =
      await Promise.all([
        executeD1Query<Record<string, unknown>>('SELECT COUNT(*) as count FROM links'),
        executeD1Query<Record<string, unknown>>('SELECT COUNT(*) as count FROM uploads'),
        executeD1Query<Record<string, unknown>>('SELECT COUNT(*) as count FROM analytics'),
        executeD1Query<Record<string, unknown>>('SELECT COUNT(*) as count FROM folders'),
        executeD1Query<Record<string, unknown>>('SELECT COUNT(*) as count FROM tags'),
        executeD1Query<Record<string, unknown>>('SELECT COUNT(*) as count FROM webhooks'),
      ]);

    const totalLinks = (linkRows[0]?.count as number) ?? 0;
    const totalUploads = (uploadRows[0]?.count as number) ?? 0;
    const totalAnalytics = (analyticsRows[0]?.count as number) ?? 0;

    return {
      connected: true,
      totalLinks,
      totalUploads,
      totalAnalytics,
      tables: [
        { name: 'links', rows: totalLinks },
        { name: 'uploads', rows: totalUploads },
        { name: 'analytics', rows: totalAnalytics },
        { name: 'folders', rows: (folderRows[0]?.count as number) ?? 0 },
        { name: 'tags', rows: (tagRows[0]?.count as number) ?? 0 },
        { name: 'webhooks', rows: (webhookRows[0]?.count as number) ?? 0 },
      ],
    };
  } catch {
    return {
      connected: false,
      totalLinks: 0,
      totalUploads: 0,
      totalAnalytics: 0,
      tables: [],
    };
  }
}

// ============================================
// R2 Stats
// ============================================

async function getR2Stats(): Promise<R2Stats> {
  const publicDomain = process.env.R2_PUBLIC_DOMAIN ?? '';

  try {
    // Fetch all R2 objects and all DB references in parallel
    const [r2Objects, uploadKeyRows, screenshotUrlRows] = await Promise.all([
      listR2Objects(),
      executeD1Query<Record<string, unknown>>('SELECT key FROM uploads'),
      executeD1Query<Record<string, unknown>>(
        'SELECT screenshot_url FROM links WHERE screenshot_url IS NOT NULL',
      ),
    ]);

    // Build lookup sets
    const uploadKeys = new Set(uploadKeyRows.map((r) => r.key as string));
    const screenshotKeys = new Set<string>();
    for (const row of screenshotUrlRows) {
      const url = row.screenshot_url as string;
      const key = extractKeyFromUrl(url, publicDomain);
      if (key) screenshotKeys.add(key);
    }

    // Classify each R2 object
    const files = classifyR2Objects(r2Objects, uploadKeys, screenshotKeys, publicDomain);
    const summary = computeSummary(files);

    return { connected: true, summary, files };
  } catch {
    return {
      connected: false,
      summary: { totalFiles: 0, totalSize: 0, orphanFiles: 0, orphanSize: 0 },
      files: [],
    };
  }
}

// ============================================
// Public Actions
// ============================================

/**
 * Scan both R2 and D1 and return combined storage stats with orphan detection.
 */
export async function scanStorage(): Promise<ActionResult<StorageScanResult>> {
  const userId = await requireAuth();
  if (!userId) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const [d1, r2] = await Promise.all([getD1Stats(), getR2Stats()]);
    return { success: true, data: { d1, r2 } };
  } catch (error) {
    console.error('Failed to scan storage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to scan storage',
    };
  }
}

/**
 * Delete orphan files from R2.
 *
 * Double-validates each key server-side before deletion:
 * only keys confirmed as orphans (not in uploads table AND not referenced
 * by any link's screenshot_url) are actually deleted.
 */
export async function cleanupOrphanFiles(
  keys: string[],
): Promise<ActionResult<{ deleted: number; skipped: number }>> {
  const userId = await requireAuth();
  if (!userId) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!Array.isArray(keys) || keys.length === 0) {
    return { success: false, error: 'No keys provided' };
  }

  if (keys.length > 5000) {
    return { success: false, error: 'Too many keys (max 5000 per request)' };
  }

  try {
    const publicDomain = process.env.R2_PUBLIC_DOMAIN ?? '';

    // Re-fetch all references to double-validate
    const [uploadKeyRows, screenshotUrlRows] = await Promise.all([
      executeD1Query<Record<string, unknown>>('SELECT key FROM uploads'),
      executeD1Query<Record<string, unknown>>(
        'SELECT screenshot_url FROM links WHERE screenshot_url IS NOT NULL',
      ),
    ]);

    const uploadKeys = new Set(uploadKeyRows.map((r) => r.key as string));
    const screenshotKeys = new Set<string>();
    for (const row of screenshotUrlRows) {
      const url = row.screenshot_url as string;
      const key = extractKeyFromUrl(url, publicDomain);
      if (key) screenshotKeys.add(key);
    }

    // Only delete keys that are truly orphans
    const confirmedOrphans: string[] = [];
    for (const key of keys) {
      if (typeof key !== 'string' || !key) continue;
      if (!uploadKeys.has(key) && !screenshotKeys.has(key)) {
        confirmedOrphans.push(key);
      }
    }

    let deleted = 0;
    if (confirmedOrphans.length > 0) {
      deleted = await deleteR2Objects(confirmedOrphans);
    }

    return {
      success: true,
      data: {
        deleted,
        skipped: keys.length - confirmedOrphans.length,
      },
    };
  } catch (error) {
    console.error('Failed to cleanup orphan files:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup orphan files',
    };
  }
}
