import { customAlphabet } from 'nanoid';
import { isValidSlug } from './constants';

// Use URL-safe alphabet without confusing characters (0, O, l, I)
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';

/**
 * Generate a random slug for a short link.
 * @param length - Length of the slug (default: 6)
 * @returns A random URL-safe slug
 */
export function generateSlug(length: number = 6): string {
  const generator = customAlphabet(alphabet, length);
  return generator();
}

/**
 * Generate a unique slug with collision retry.
 * @param checkExists - Function to check if slug already exists
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns A unique slug
 * @throws Error if max retries exceeded
 */
export async function generateUniqueSlug(
  checkExists: (slug: string) => Promise<boolean>,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const slug = generateSlug();
    
    // Check if valid (not reserved)
    if (!isValidSlug(slug)) {
      continue;
    }
    
    // Check if already exists in database
    const exists = await checkExists(slug);
    if (!exists) {
      return slug;
    }
  }
  
  throw new Error(`Failed to generate unique slug after ${maxRetries} attempts`);
}

/**
 * Validate and sanitize a custom slug.
 * @param slug - User-provided slug
 * @returns Sanitized slug or null if invalid
 */
export function sanitizeSlug(slug: string): string | null {
  const sanitized = slug.trim().toLowerCase();
  
  if (!isValidSlug(sanitized)) {
    return null;
  }
  
  return sanitized;
}
