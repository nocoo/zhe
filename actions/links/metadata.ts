'use server';

import { getAuthContext } from '@/lib/auth-context';
import type { Link } from '@/lib/db/schema';
import type { ActionResult } from './types';

/**
 * Re-fetch link metadata (title, description, favicon) for a single link via
 * the enrichment strategy registry.
 */
export async function refreshLinkMetadata(linkId: number): Promise<ActionResult<Link>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }
    const { db, userId } = ctx;

    const link = await db.getLinkById(linkId);
    if (!link) {
      return { success: false, error: 'Link not found or access denied' };
    }

    const { refreshLinkEnrichment } = await import('@/actions/enrichment');
    const result = await refreshLinkEnrichment(link.originalUrl, linkId, userId);
    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to refresh metadata' };
    }

    // Re-fetch the updated link
    const updated = await db.getLinkById(linkId);
    if (!updated) {
      return { success: false, error: 'Link not found after refresh' };
    }
    return { success: true, data: updated };
  } catch (error) {
    console.error('Failed to refresh metadata:', error);
    return { success: false, error: 'Failed to refresh metadata' };
  }
}

/**
 * Batch-refresh metadata for multiple links in a single server action call.
 *
 * Replaces the N+1 pattern where each LinkCard independently calls
 * `refreshLinkMetadata` on mount. Instead, the parent collects all link IDs
 * that need metadata and calls this once.
 *
 * - 1x auth call (vs N)
 * - 1x batch DB fetch (vs N individual getLinkById)
 * - Concurrent enrichment with a concurrency limit to avoid overwhelming
 *   external sites
 * - 1x batch DB re-fetch for updated links
 */
const BATCH_REFRESH_MAX = 500;
const BATCH_CONCURRENCY = 5;

export async function batchRefreshLinkMetadata(
  linkIds: number[],
): Promise<ActionResult<Link[]>> {
  if (linkIds.length === 0) {
    return { success: true, data: [] };
  }

  if (linkIds.length > BATCH_REFRESH_MAX) {
    return {
      success: false,
      error: `Too many link IDs (${linkIds.length}). Maximum is ${BATCH_REFRESH_MAX}.`,
    };
  }

  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }
    const { db, userId } = ctx;

    // Batch fetch all links
    const links = await db.getLinksByIds(linkIds);
    if (links.length === 0) {
      return { success: true, data: [] };
    }

    // Enrich each link using the strategy registry with concurrency limit
    const { refreshLinkEnrichment } = await import('@/actions/enrichment');
    const queue = [...links];
    const settled: number[] = [];

    async function processNext(): Promise<void> {
      while (queue.length > 0) {
        const link = queue.shift();
        if (!link) break;
        try {
          await refreshLinkEnrichment(link.originalUrl, link.id, userId);
        } catch {
          console.error('Batch enrichment failed for link', link.id);
        }
        settled.push(link.id);
      }
    }

    const workers = Array.from(
      { length: Math.min(BATCH_CONCURRENCY, links.length) },
      () => processNext(),
    );
    await Promise.all(workers);

    const updatedLinks = await db.getLinksByIds(settled);
    return { success: true, data: updatedLinks };
  } catch (error) {
    console.error('Failed to batch refresh metadata:', error);
    return { success: false, error: 'Failed to batch refresh metadata' };
  }
}
