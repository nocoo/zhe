/**
 * Reserved paths that cannot be used as short link slugs.
 * These paths are used by the application for routing.
 */
export const RESERVED_PATHS = [
  'login',
  'logout',
  'auth',
  'callback',
  'dashboard',
  'api',
  'admin',
  '_next',
  'static',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
] as const;

export type ReservedPath = (typeof RESERVED_PATHS)[number];

/**
 * Check if a path is reserved and cannot be used as a slug.
 */
export function isReservedPath(path: string): boolean {
  const normalizedPath = path.toLowerCase().replace(/^\//, '');
  return RESERVED_PATHS.some(
    (reserved) => normalizedPath === reserved || normalizedPath.startsWith(`${reserved}/`)
  );
}

/**
 * Validate if a slug is valid for use as a short link.
 * - Must be 1-50 characters
 * - Only alphanumeric, hyphens, and underscores
 * - Cannot be a reserved path
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length === 0 || slug.length > 50) {
    return false;
  }

  // Only allow alphanumeric, hyphens, and underscores
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(slug)) {
    return false;
  }

  // Cannot be a reserved path
  if (isReservedPath(slug)) {
    return false;
  }

  return true;
}
