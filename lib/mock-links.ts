/**
 * Mock link storage for Phase 1 testing.
 * This will be replaced by D1 database queries in Phase 2.
 */

export interface MockLink {
  slug: string;
  originalUrl: string;
  expiresAt?: Date;
}

// Mock data for testing redirection
export const MOCK_LINKS: MockLink[] = [
  {
    slug: 'github',
    originalUrl: 'https://github.com',
  },
  {
    slug: 'google',
    originalUrl: 'https://google.com',
  },
  {
    slug: 'expired',
    originalUrl: 'https://example.com',
    expiresAt: new Date('2020-01-01'), // Already expired
  },
];

/**
 * Look up a link by slug (mock implementation).
 * @param slug - The short link slug
 * @returns The link data or null if not found
 */
export function getMockLink(slug: string): MockLink | null {
  return MOCK_LINKS.find((link) => link.slug === slug) || null;
}

/**
 * Check if a link is expired.
 * @param link - The link to check
 * @returns true if expired, false otherwise
 */
export function isLinkExpired(link: MockLink): boolean {
  if (!link.expiresAt) {
    return false;
  }
  return new Date() > link.expiresAt;
}
