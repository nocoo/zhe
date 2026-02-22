// Pure business logic for link operations — no React, no DOM.

import type { Link, Tag, LinkTag, AnalyticsStats } from "./types";

/** Build a short URL from site base URL and slug */
export function buildShortUrl(siteUrl: string, slug: string): string {
  return `${siteUrl}/${slug}`;
}

/** Strip protocol from a URL for display: "https://example.com" → "example.com" */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** Extract hostname from a URL: "https://example.com/path" → "example.com". Returns the raw URL on parse failure. */
export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Check if a link has expired */
export function isLinkExpired(link: Link): boolean {
  if (!link.expiresAt) return false;
  return new Date(link.expiresAt) < new Date();
}

/** Sort links by creation date (newest first) */
export function sortLinksByDate(links: Link[]): Link[] {
  return [...links].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Get the top N entries from a breakdown, sorted by count descending */
export function topBreakdownEntries(
  breakdown: Record<string, number>,
  n: number
): [string, number][] {
  return Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** Check if analytics data is populated */
export function hasAnalyticsData(stats: AnalyticsStats): boolean {
  return (
    stats.totalClicks > 0 ||
    stats.uniqueCountries.length > 0 ||
    Object.keys(stats.deviceBreakdown).length > 0
  );
}

/** Context for tag-aware search */
export interface FilterContext {
  tags: Tag[];
  linkTags: LinkTag[];
}

/**
 * Filter links by substring match on slug, original URL, meta title,
 * meta description, note, or tag name (case-insensitive).
 *
 * When `ctx` is provided, tag names associated with each link are also searched.
 */
export function filterLinks(
  links: Link[],
  query: string,
  ctx?: FilterContext,
): Link[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return links;

  // Pre-build a linkId → tag names lookup for O(1) access per link
  let tagNamesByLinkId: Map<number, string[]> | undefined;
  if (ctx) {
    const tagNameById = new Map<string, string>();
    for (const tag of ctx.tags) {
      tagNameById.set(tag.id, tag.name.toLowerCase());
    }
    tagNamesByLinkId = new Map();
    for (const lt of ctx.linkTags) {
      const name = tagNameById.get(lt.tagId);
      if (!name) continue;
      let names = tagNamesByLinkId.get(lt.linkId);
      if (!names) {
        names = [];
        tagNamesByLinkId.set(lt.linkId, names);
      }
      names.push(name);
    }
  }

  return links.filter((link) => {
    // Slug
    if (link.slug.toLowerCase().includes(trimmed)) return true;
    // Original URL (protocol-stripped)
    if (stripProtocol(link.originalUrl).toLowerCase().includes(trimmed)) return true;
    // Meta title
    if (link.metaTitle?.toLowerCase().includes(trimmed)) return true;
    // Meta description
    if (link.metaDescription?.toLowerCase().includes(trimmed)) return true;
    // Note
    if (link.note?.toLowerCase().includes(trimmed)) return true;
    // Tag names
    if (tagNamesByLinkId) {
      const names = tagNamesByLinkId.get(link.id);
      if (names?.some((n) => n.includes(trimmed))) return true;
    }
    return false;
  });
}

/** Link count breakdown for sidebar badges */
export interface LinkCounts {
  /** Total number of links */
  total: number;
  /** Links with no folder (folderId is null) */
  uncategorized: number;
  /** Per-folder link counts keyed by folderId */
  byFolder: Map<string, number>;
}

/** Build link count breakdown from an array of links */
export function buildLinkCounts(links: Link[]): LinkCounts {
  let uncategorized = 0;
  const byFolder = new Map<string, number>();

  for (const link of links) {
    if (link.folderId === null) {
      uncategorized++;
    } else {
      byFolder.set(link.folderId, (byFolder.get(link.folderId) ?? 0) + 1);
    }
  }

  return { total: links.length, uncategorized, byFolder };
}

// --- Screenshot services ---

/** Screenshot source provider */
export type ScreenshotSource = "microlink" | "screenshotDomains";

/** Fetch a screenshot URL from Microlink API (no caching — DB handles persistence) */
export async function fetchMicrolinkScreenshot(targetUrl: string): Promise<string | null> {
  try {
    const apiUrl = new URL("https://api.microlink.io");
    apiUrl.searchParams.set("url", targetUrl);
    apiUrl.searchParams.set("screenshot", "true");

    const res = await fetch(apiUrl.toString());
    if (!res.ok) return null;

    const json = await res.json();
    const screenshotUrl: string | undefined = json?.data?.screenshot?.url;
    return screenshotUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch a screenshot from screenshot.domains service.
 * The service returns a 302 redirect to the actual CDN image URL
 * (img.screenshot.domains), so we follow the redirect and return
 * the final resolved URL for reliable server-side download.
 */
export async function fetchScreenshotDomains(targetUrl: string): Promise<string | null> {
  try {
    const { hostname } = new URL(targetUrl);
    if (!hostname) return null;
    const screenshotUrl = `https://screenshot.domains/${hostname}`;

    // Verify reachability with a timeout; use HEAD to avoid downloading the image.
    // fetch() follows redirects by default, so res.url is the final CDN URL.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(screenshotUrl, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`screenshot.domains returned ${res.status} for ${hostname}`);
      return null;
    }

    // Return the final URL after redirect (e.g. https://img.screenshot.domains/...)
    return res.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`screenshot.domains fetch failed for ${targetUrl}: ${message}`);
    return null;
  }
}
