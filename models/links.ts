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
