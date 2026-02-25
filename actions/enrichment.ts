'use server';

import { ScopedDB } from '@/lib/db/scoped';
import { fetchMetadata } from '@/lib/metadata';
import type { LinkEnrichmentStrategy } from '@/models/enrichment';
import type { ActionResult } from '@/actions/links';

// ---------------------------------------------------------------------------
// Default HTML Metadata Strategy
// ---------------------------------------------------------------------------

/**
 * Fallback strategy: scrapes HTML `<meta>` tags via url-metadata.
 * Handles any URL that no specialised strategy claims.
 */
const defaultMetadataStrategy: LinkEnrichmentStrategy = {
  name: 'default-metadata',

  canHandle: () => true, // catch-all

  async enrich(url: string, linkId: number, userId: string): Promise<void> {
    const db = new ScopedDB(userId);
    const meta = await fetchMetadata(url);
    if (meta.title || meta.description || meta.favicon) {
      await db.updateLinkMetadata(linkId, {
        metaTitle: meta.title,
        metaDescription: meta.description,
        metaFavicon: meta.favicon,
      });
    }
  },

  async refresh(url: string, linkId: number, userId: string): Promise<ActionResult> {
    const db = new ScopedDB(userId);
    const meta = await fetchMetadata(url);
    await db.updateLinkMetadata(linkId, {
      metaTitle: meta.title,
      metaDescription: meta.description,
      metaFavicon: meta.favicon,
    });
    return { success: true };
  },
};

// ---------------------------------------------------------------------------
// Twitter / X Enrichment Strategy
// ---------------------------------------------------------------------------

/**
 * Lazy-loaded Twitter strategy.
 * Uses dynamic import so the xray module is only loaded when a Twitter URL
 * is actually encountered — keeping the critical path lean.
 */
const twitterEnrichmentStrategy: LinkEnrichmentStrategy = {
  name: 'twitter-xray',

  canHandle(url: string): boolean {
    // Inline the detection to avoid importing models/links at module level.
    // Matches: x.com/user/status/id, twitter.com/user/status/id
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^(www\.|mobile\.)/, '');
      return (
        (host === 'x.com' || host === 'twitter.com') &&
        /^\/[^/]+\/status\/\d+/.test(u.pathname)
      );
    } catch {
      return false;
    }
  },

  async enrich(url: string, linkId: number): Promise<void> {
    const { fetchAndCacheTweet } = await import('@/actions/xray');
    await fetchAndCacheTweet(url, linkId);
  },

  async refresh(url: string, linkId: number): Promise<ActionResult> {
    const { forceRefreshTweetCache } = await import('@/actions/xray');
    const result = await forceRefreshTweetCache(url, linkId);
    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to refresh tweet metadata' };
    }
    return { success: true };
  },
};

// ---------------------------------------------------------------------------
// Strategy Registry
// ---------------------------------------------------------------------------

/**
 * Ordered list of enrichment strategies. First match wins.
 * The default (catch-all) strategy must always be last.
 */
const strategies: LinkEnrichmentStrategy[] = [
  twitterEnrichmentStrategy,
  defaultMetadataStrategy,
];

/**
 * Find the enrichment strategy that can handle the given URL.
 * Always returns a strategy (defaultMetadataStrategy is the catch-all).
 */
function resolveStrategy(url: string): LinkEnrichmentStrategy {
  return strategies.find((s) => s.canHandle(url))!;
}

// ---------------------------------------------------------------------------
// Public API — called by actions/links.ts
// ---------------------------------------------------------------------------

/**
 * Enrich a newly created link (fire-and-forget).
 * Delegates to the first matching strategy in the registry.
 */
export async function enrichLink(
  url: string,
  linkId: number,
  userId: string,
): Promise<void> {
  const strategy = resolveStrategy(url);
  await strategy.enrich(url, linkId, userId);
}

/**
 * Force-refresh metadata for an existing link.
 * Delegates to the first matching strategy in the registry.
 */
export async function refreshLinkEnrichment(
  url: string,
  linkId: number,
  userId: string,
): Promise<ActionResult> {
  const strategy = resolveStrategy(url);
  return strategy.refresh(url, linkId, userId);
}
