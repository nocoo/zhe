// Pure business logic for link operations — no React, no DOM.

import type { Link, AnalyticsStats } from "./types";

/** Build a short URL from site base URL and slug */
export function buildShortUrl(siteUrl: string, slug: string): string {
  return `${siteUrl}/${slug}`;
}

/** Strip protocol from a URL for display: "https://example.com" → "example.com" */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
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

/** Filter links by substring match on slug or original URL (protocol-stripped, case-insensitive) */
export function filterLinks(links: Link[], query: string): Link[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return links;
  return links.filter((link) => {
    const slug = link.slug.toLowerCase();
    const url = stripProtocol(link.originalUrl).toLowerCase();
    return slug.includes(trimmed) || url.includes(trimmed);
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

// --- Screenshot via Microlink API ---

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
