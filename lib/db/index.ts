/**
 * Database client abstraction.
 * This module provides a unified interface for database operations.
 * Currently uses mock data, will be replaced with D1 in production.
 */

import type { Link, NewLink } from './schema';

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
  nextId = 1;
}
