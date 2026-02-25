'use server';

import { getScopedDB } from '@/lib/auth-context';
import { validateFolderName, isValidFolderIcon } from '@/models/folders';
import type { Folder } from '@/lib/db/schema';
import type { ActionResult } from '@/actions/links';

export interface CreateFolderInput {
  name: string;
  icon?: string;
}

export interface UpdateFolderInput {
  name?: string;
  icon?: string;
}

/**
 * Get all folders for the current user.
 */
export async function getFolders(): Promise<ActionResult<Folder[]>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const folders = await db.getFolders();
    return { success: true, data: folders };
  } catch (error) {
    console.error('Failed to get folders:', error);
    return { success: false, error: 'Failed to get folders' };
  }
}

/**
 * Create a new folder.
 */
export async function createFolder(input: CreateFolderInput): Promise<ActionResult<Folder>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const validName = validateFolderName(input.name);
    if (!validName) {
      return { success: false, error: 'Invalid folder name' };
    }

    if (input.icon && !isValidFolderIcon(input.icon)) {
      return { success: false, error: 'Invalid icon' };
    }

    const data: { name: string; icon?: string } = { name: validName };
    if (input.icon) {
      data.icon = input.icon;
    }

    const folder = await db.createFolder(data);
    return { success: true, data: folder };
  } catch (error) {
    console.error('Failed to create folder:', error);
    return { success: false, error: 'Failed to create folder' };
  }
}

/**
 * Update a folder by id.
 */
export async function updateFolder(
  id: string,
  input: UpdateFolderInput,
): Promise<ActionResult<Folder>> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const updateData: { name?: string; icon?: string } = {};

    if (input.name !== undefined) {
      const validName = validateFolderName(input.name);
      if (!validName) {
        return { success: false, error: 'Invalid folder name' };
      }
      updateData.name = validName;
    }

    if (input.icon !== undefined) {
      if (!isValidFolderIcon(input.icon)) {
        return { success: false, error: 'Invalid icon' };
      }
      updateData.icon = input.icon;
    }

    const folder = await db.updateFolder(id, updateData);
    if (!folder) {
      return { success: false, error: 'Folder not found or access denied' };
    }

    return { success: true, data: folder };
  } catch (error) {
    console.error('Failed to update folder:', error);
    return { success: false, error: 'Failed to update folder' };
  }
}

/**
 * Delete a folder by id.
 */
export async function deleteFolder(id: string): Promise<ActionResult> {
  try {
    const db = await getScopedDB();
    if (!db) {
      return { success: false, error: 'Unauthorized' };
    }

    const deleted = await db.deleteFolder(id);
    if (!deleted) {
      return { success: false, error: 'Folder not found or access denied' };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to delete folder:', error);
    return { success: false, error: 'Failed to delete folder' };
  }
}
