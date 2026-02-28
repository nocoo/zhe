'use server';

import { getScopedDB } from '@/lib/auth-context';
import { kvPutLink } from '@/lib/kv/client';

import {
  parseImportPayload,
  parsePreviewStyle,
  serializeLinksForExport,
  type ExportedLink,
  type PreviewStyle,
} from '@/models/settings';

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
      try {
        const link = await db.createLink({
          originalUrl: entry.originalUrl,
          slug: entry.slug,
          isCustom: entry.isCustom,
          clicks: entry.clicks,
        });
        created++;

        // Fire-and-forget: sync to Cloudflare KV for edge redirect caching
        void kvPutLink(link.slug, {
          id: link.id,
          originalUrl: link.originalUrl,
          expiresAt: link.expiresAt?.getTime() ?? null,
        });
      } catch (err) {
        // UNIQUE constraint on slug — treat as skip (eliminates TOCTOU race
        // that existed with the previous slugExists-then-insert pattern)
        const message = err instanceof Error ? err.message : '';
        if (message.includes('UNIQUE') || message.includes('unique') || message.includes('duplicate')) {
          skipped++;
        } else {
          throw err;
        }
      }
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
