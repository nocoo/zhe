'use server';

import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';
import { slugExists } from '@/lib/db';
import {
  parseImportPayload,
  parsePreviewStyle,
  serializeLinksForExport,
  type ExportedLink,
  type PreviewStyle,
} from '@/models/settings';

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

export interface ImportResult {
  created: number;
  skipped: number;
}

/**
 * Import links from an exported JSON payload.
 * Skips links whose slugs already exist.
 */
export async function importLinks(
  payload: ExportedLink[],
): Promise<{ success: boolean; data?: ImportResult; error?: string }> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const parsed = parseImportPayload(payload);
    if (!parsed.success || !parsed.data) {
      return { success: false, error: parsed.error };
    }

    let created = 0;
    let skipped = 0;

    for (const entry of parsed.data) {
      const exists = await slugExists(entry.slug);
      if (exists) {
        skipped++;
        continue;
      }

      await db.createLink({
        originalUrl: entry.originalUrl,
        slug: entry.slug,
        isCustom: entry.isCustom,
        clicks: entry.clicks,
      });
      created++;
    }

    return { success: true, data: { created, skipped } };
  } catch (error) {
    console.error('Failed to import links:', error);
    return { success: false, error: 'Failed to import links' };
  }
}

/**
 * Export all links for the current user as serialized JSON.
 */
export async function exportLinks(): Promise<{
  success: boolean;
  data?: ExportedLink[];
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const links = await db.getLinks();
    const exported = serializeLinksForExport(links);
    return { success: true, data: exported };
  } catch (error) {
    console.error('Failed to export links:', error);
    return { success: false, error: 'Failed to export links' };
  }
}

/**
 * Get the preview style setting for the current user.
 * Returns the default ('favicon') if no setting exists.
 */
export async function getPreviewStyle(): Promise<{
  success: boolean;
  data?: PreviewStyle;
  error?: string;
}> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const settings = await db.getUserSettings();
    const style = parsePreviewStyle(settings?.previewStyle);
    return { success: true, data: style };
  } catch (error) {
    console.error('Failed to get preview style:', error);
    return { success: false, error: 'Failed to get preview style' };
  }
}

/**
 * Update the preview style setting for the current user.
 * Creates the row if it doesn't exist (upsert).
 */
export async function updatePreviewStyle(
  value: string,
): Promise<{ success: boolean; data?: PreviewStyle; error?: string }> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const style = parsePreviewStyle(value);
    await db.upsertPreviewStyle(style);
    return { success: true, data: style };
  } catch (error) {
    console.error('Failed to update preview style:', error);
    return { success: false, error: 'Failed to update preview style' };
  }
}
