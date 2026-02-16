/**
 * URL metadata fetching utility.
 *
 * Fetches title, description, and favicon from a given URL.
 * Designed for graceful degradation — never throws, returns nulls on failure.
 */

import urlMetadata from 'url-metadata';

const FETCH_TIMEOUT_MS = 5000;
const MAX_TITLE_LENGTH = 512;
const MAX_DESCRIPTION_LENGTH = 1024;

export interface LinkMetadata {
  title: string | null;
  description: string | null;
  favicon: string | null;
}

/**
 * Fetch metadata (title, description, favicon) from a URL.
 *
 * - Gracefully degrades: returns `{ title: null, description: null, favicon: null }` on any error.
 * - Tries `og:title` / `og:description` as fallbacks when standard fields are empty.
 * - Resolves relative favicon URLs against the page origin.
 * - Truncates overly long title/description values.
 */
export async function fetchMetadata(url: string): Promise<LinkMetadata> {
  try {
    const meta = await urlMetadata(url, { timeout: FETCH_TIMEOUT_MS });

    const rawTitle = (meta.title || meta['og:title'] || '') as string;
    const rawDescription = (meta.description || meta['og:description'] || '') as string;

    const title = sanitizeText(rawTitle, MAX_TITLE_LENGTH);
    const description = sanitizeText(rawDescription, MAX_DESCRIPTION_LENGTH);
    const favicon = extractFavicon(meta, url);

    return { title, description, favicon };
  } catch {
    return { title: null, description: null, favicon: null };
  }
}

/** Trim, nullify empty strings, and truncate to maxLength. */
function sanitizeText(raw: string, maxLength: number): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/** Extract the best favicon URL, resolving relative paths. */
function extractFavicon(
  meta: Record<string, unknown>,
  pageUrl: string,
): string | null {
  const favicons = (meta.favicons ?? []) as Array<{ href?: string }>;

  // Find the first favicon with a non-empty href
  const firstValid = favicons.find((f) => f.href && f.href.trim().length > 0);

  if (firstValid?.href) {
    return resolveUrl(firstValid.href, pageUrl);
  }

  // Fallback: origin + /favicon.ico
  try {
    const origin = new URL(pageUrl).origin;
    return `${origin}/favicon.ico`;
  } catch {
    return null;
  }
}

/** Resolve a potentially relative URL against a base URL. */
function resolveUrl(href: string, base: string): string {
  try {
    // Handle protocol-relative URLs
    if (href.startsWith('//')) {
      const protocol = new URL(base).protocol;
      return `${protocol}${href}`;
    }
    // Handle relative paths
    if (href.startsWith('/')) {
      const origin = new URL(base).origin;
      return `${origin}${href}`;
    }
    // Already absolute
    return href;
  } catch {
    return href;
  }
}
