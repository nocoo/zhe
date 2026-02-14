// Pure business logic for folder operations — no React, no DOM.

/** Curated subset of Lucide icon names available for folders */
export const FOLDER_ICONS = [
  'folder',
  'folder-open',
  'star',
  'heart',
  'bookmark',
  'tag',
  'zap',
  'flame',
  'rocket',
  'globe',
  'briefcase',
  'code',
  'coffee',
  'music',
  'image',
  'film',
  'book',
  'graduation-cap',
  'gamepad-2',
  'palette',
  'shopping-bag',
  'gift',
  'megaphone',
  'lightbulb',
] as const;

export type FolderIconName = (typeof FOLDER_ICONS)[number];

export const DEFAULT_FOLDER_ICON: FolderIconName = 'folder';

const MAX_FOLDER_NAME_LENGTH = 50;

/** Check if a string is a valid folder icon name */
export function isValidFolderIcon(icon: string): icon is FolderIconName {
  return (FOLDER_ICONS as readonly string[]).includes(icon);
}

/**
 * Validate and sanitize a folder name.
 * Returns the trimmed name if valid, or null if invalid.
 */
export function validateFolderName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_FOLDER_NAME_LENGTH) {
    return null;
  }
  return trimmed;
}
