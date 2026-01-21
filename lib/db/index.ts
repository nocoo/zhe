/**
 * Database client abstraction.
 * This module provides a unified interface for database operations.
 * Currently uses mock data, will be replaced with D1 in production.
 */

import type { Link, NewLink, Analytics, NewAnalytics } from './schema';

// In-memory storage for development (will be replaced by D1)
const mockStorage: Map<string, Link> = new Map();
let nextId = 1;

/**
 * Get a link by slug.
 */
export async function getLinkBySlug(slug: string): Promise<Link | null> {
  for (const link of mockStorage.values()) {
    if (link.slug === slug) {
      return link;
    }
  }
  return null;
}

/**
 * Check if a slug exists.
 */
export async function slugExists(slug: string): Promise<boolean> {
  return (await getLinkBySlug(slug)) !== null;
}

/**
 * Create a new link.
 */
export async function createLink(data: Omit<NewLink, 'id' | 'createdAt'>): Promise<Link> {
  const link: Link = {
    id: nextId++,
    userId: data.userId,
    folderId: data.folderId ?? null,
    originalUrl: data.originalUrl,
    slug: data.slug,
    isCustom: data.isCustom ?? false,
    expiresAt: data.expiresAt ?? null,
    clicks: data.clicks ?? 0,
    createdAt: new Date(),
  };
  
  mockStorage.set(link.slug, link);
  return link;
}

/**
 * Get all links for a user.
 */
export async function getLinksByUserId(userId: string): Promise<Link[]> {
  const links: Link[] = [];
  for (const link of mockStorage.values()) {
    if (link.userId === userId) {
      links.push(link);
    }
  }
  return links.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Delete a link by id and user id.
 * Returns true if deleted, false if not found or not authorized.
 */
export async function deleteLinkById(id: number, userId: string): Promise<boolean> {
  for (const [slug, link] of mockStorage.entries()) {
    if (link.id === id && link.userId === userId) {
      mockStorage.delete(slug);
      return true;
    }
  }
  return false;
}

/**
 * Update link by id and user id.
 */
export async function updateLink(
  id: number,
  userId: string,
  data: Partial<Pick<Link, 'originalUrl' | 'folderId' | 'expiresAt'>>
): Promise<Link | null> {
  for (const [slug, link] of mockStorage.entries()) {
    if (link.id === id && link.userId === userId) {
      const updated = { ...link, ...data };
      mockStorage.set(slug, updated);
      return updated;
    }
  }
  return null;
}

/**
 * Increment click count for a link.
 */
export async function incrementClicks(slug: string): Promise<void> {
  const link = mockStorage.get(slug);
  if (link) {
    link.clicks = (link.clicks ?? 0) + 1;
  }
}

/**
 * Clear all mock data (for testing).
 */
export function clearMockStorage(): void {
  mockStorage.clear();
  analyticsStorage.length = 0;
  nextId = 1;
  nextAnalyticsId = 1;
}

// ============================================
// Analytics Operations
// ============================================

// In-memory analytics storage for development
const analyticsStorage: Analytics[] = [];
let nextAnalyticsId = 1;

/**
 * Record a click event for analytics.
 */
export async function recordClick(
  data: Omit<NewAnalytics, 'id' | 'createdAt'>
): Promise<Analytics> {
  const record: Analytics = {
    id: nextAnalyticsId++,
    linkId: data.linkId,
    country: data.country ?? null,
    city: data.city ?? null,
    device: data.device ?? null,
    browser: data.browser ?? null,
    os: data.os ?? null,
    referer: data.referer ?? null,
    createdAt: new Date(),
  };

  analyticsStorage.push(record);
  
  // Also increment the click count on the link
  for (const link of mockStorage.values()) {
    if (link.id === data.linkId) {
      link.clicks = (link.clicks ?? 0) + 1;
      break;
    }
  }

  return record;
}

/**
 * Get analytics records for a specific link.
 */
export async function getAnalyticsByLinkId(linkId: number): Promise<Analytics[]> {
  return analyticsStorage
    .filter((a) => a.linkId === linkId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get aggregated analytics stats for a link.
 */
export async function getAnalyticsStats(linkId: number): Promise<{
  totalClicks: number;
  uniqueCountries: string[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}> {
  const records = analyticsStorage.filter((a) => a.linkId === linkId);
  
  const countries = new Set<string>();
  const devices: Record<string, number> = {};
  const browsers: Record<string, number> = {};
  const oses: Record<string, number> = {};
  
  for (const record of records) {
    if (record.country) countries.add(record.country);
    if (record.device) devices[record.device] = (devices[record.device] || 0) + 1;
    if (record.browser) browsers[record.browser] = (browsers[record.browser] || 0) + 1;
    if (record.os) oses[record.os] = (oses[record.os] || 0) + 1;
  }
  
  return {
    totalClicks: records.length,
    uniqueCountries: Array.from(countries),
    deviceBreakdown: devices,
    browserBreakdown: browsers,
    osBreakdown: oses,
  };
}

/**
 * Get analytics for all links owned by a user.
 */
export async function getAnalyticsByUserId(userId: string): Promise<Analytics[]> {
  const userLinks = await getLinksByUserId(userId);
  const linkIds = new Set(userLinks.map((l) => l.id));
  
  return analyticsStorage
    .filter((a) => linkIds.has(a.linkId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
