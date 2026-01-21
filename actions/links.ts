'use server';

import { auth } from '@/auth';
import { 
  createLink as dbCreateLink, 
  getLinksByUserId,
  deleteLinkById,
  updateLink as dbUpdateLink,
  slugExists 
} from '@/lib/db';
import { generateUniqueSlug, sanitizeSlug } from '@/lib/slug';
import type { Link } from '@/lib/db/schema';

async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export interface CreateLinkInput {
  originalUrl: string;
  customSlug?: string;
  folderId?: string;
  expiresAt?: Date;
}

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new short link.
 */
export async function createLink(input: CreateLinkInput): Promise<ActionResult<Link>> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate URL
    try {
      new URL(input.originalUrl);
    } catch {
      return { success: false, error: 'Invalid URL' };
    }

    let slug: string;

    if (input.customSlug) {
      // Custom slug mode
      const sanitized = sanitizeSlug(input.customSlug);
      if (!sanitized) {
        return { success: false, error: 'Invalid slug format or reserved word' };
      }

      // Check if already exists
      if (await slugExists(sanitized)) {
        return { success: false, error: 'Slug already taken' };
      }

      slug = sanitized;
    } else {
      // Auto-generate slug
      slug = await generateUniqueSlug(slugExists);
    }

    const link = await dbCreateLink({
      userId,
      originalUrl: input.originalUrl,
      slug,
      isCustom: !!input.customSlug,
      folderId: input.folderId,
      expiresAt: input.expiresAt,
    });

    return { success: true, data: link };
  } catch (error) {
    console.error('Failed to create link:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create link' 
    };
  }
}

/**
 * Get all links for the current user.
 */
export async function getLinks(): Promise<ActionResult<Link[]>> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const links = await getLinksByUserId(userId);
    return { success: true, data: links };
  } catch (error) {
    console.error('Failed to get links:', error);
    return { success: false, error: 'Failed to get links' };
  }
}

/**
 * Delete a link by ID.
 */
export async function deleteLink(linkId: number): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const deleted = await deleteLinkById(linkId, userId);
    if (!deleted) {
      return { success: false, error: 'Link not found or access denied' };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to delete link:', error);
    return { success: false, error: 'Failed to delete link' };
  }
}

/**
 * Update a link.
 */
export async function updateLink(
  linkId: number,
  data: { originalUrl?: string; folderId?: string; expiresAt?: Date }
): Promise<ActionResult<Link>> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate URL if provided
    if (data.originalUrl) {
      try {
        new URL(data.originalUrl);
      } catch {
        return { success: false, error: 'Invalid URL' };
      }
    }

    const updated = await dbUpdateLink(linkId, userId, data);
    if (!updated) {
      return { success: false, error: 'Link not found or access denied' };
    }

    return { success: true, data: updated };
  } catch (error) {
    console.error('Failed to update link:', error);
    return { success: false, error: 'Failed to update link' };
  }
}
