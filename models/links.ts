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

const SCREENSHOT_CACHE_PREFIX = "zhe_screenshot_";
const SCREENSHOT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedScreenshot {
  url: string;
  cachedAt: number;
}

/** Build the localStorage key for a given original URL */
export function screenshotCacheKey(originalUrl: string): string {
  return `${SCREENSHOT_CACHE_PREFIX}${originalUrl}`;
}

/** Read a cached screenshot URL. Returns null if missing or expired. */
export function getCachedScreenshot(originalUrl: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(screenshotCacheKey(originalUrl));
    if (!raw) return null;
    const cached: CachedScreenshot = JSON.parse(raw);
    if (Date.now() - cached.cachedAt > SCREENSHOT_CACHE_TTL_MS) {
      localStorage.removeItem(screenshotCacheKey(originalUrl));
      return null;
    }
    return cached.url;
  } catch {
    return null;
  }
}

/** Write a screenshot URL to localStorage cache */
export function setCachedScreenshot(originalUrl: string, screenshotUrl: string): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CachedScreenshot = { url: screenshotUrl, cachedAt: Date.now() };
    localStorage.setItem(screenshotCacheKey(originalUrl), JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/** Build the Microlink API URL that returns a screenshot for a given page URL */
export function buildMicrolinkScreenshotUrl(targetUrl: string): string {
  const params = new URLSearchParams({
    url: targetUrl,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
  });
  return `https://api.microlink.io?${params.toString()}`;
}

/** Fetch a screenshot URL for a target page, using cache when available */
export async function fetchScreenshotUrl(targetUrl: string): Promise<string | null> {
  const cached = getCachedScreenshot(targetUrl);
  if (cached) return cached;

  try {
    const apiUrl = new URL("https://api.microlink.io");
    apiUrl.searchParams.set("url", targetUrl);
    apiUrl.searchParams.set("screenshot", "true");

    const res = await fetch(apiUrl.toString());
    if (!res.ok) return null;

    const json = await res.json();
    const screenshotUrl: string | undefined = json?.data?.screenshot?.url;
    if (!screenshotUrl) return null;

    setCachedScreenshot(targetUrl, screenshotUrl);
    return screenshotUrl;
  } catch {
    return null;
  }
}
