// Pure business logic for tag operations — no React, no DOM.

/** Predefined Tailwind color names for tag styling */
export const TAG_COLORS = [
  'slate',
  'red',
  'orange',
  'amber',
  'emerald',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'pink',
  'rose',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

const MAX_TAG_NAME_LENGTH = 30;

/** Check if a string is a valid tag color */
export function isValidTagColor(color: string): color is TagColor {
  return (TAG_COLORS as readonly string[]).includes(color);
}

/** Pick a random color from the palette */
export function randomTagColor(): TagColor {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

/**
 * Derive a deterministic tag color from its name.
 * Uses a simple char-code hash (handles CJK/emoji) so the same name
 * always produces the same color — no DB lookup required.
 */
export function tagColorFromName(name: string): TagColor {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    // djb2-style: hash * 31 + charCode
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const index = ((hash % TAG_COLORS.length) + TAG_COLORS.length) % TAG_COLORS.length;
  return TAG_COLORS[index];
}

/**
 * Validate and sanitize a tag name.
 * Returns the trimmed name if valid, or null if invalid.
 */
export function validateTagName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_TAG_NAME_LENGTH) {
    return null;
  }
  return trimmed;
}

/** Tailwind class sets for each tag color (bg + text for light & dark) */
export const TAG_COLOR_MAP: Record<TagColor, { badge: string; dot: string }> = {
  slate:   { badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',   dot: 'bg-slate-500' },
  red:     { badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',           dot: 'bg-red-500' },
  orange:  { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', dot: 'bg-orange-500' },
  amber:   { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',   dot: 'bg-amber-500' },
  emerald: { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300', dot: 'bg-emerald-500' },
  teal:    { badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',       dot: 'bg-teal-500' },
  cyan:    { badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',       dot: 'bg-cyan-500' },
  blue:    { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',       dot: 'bg-blue-500' },
  indigo:  { badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300', dot: 'bg-indigo-500' },
  violet:  { badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300', dot: 'bg-violet-500' },
  pink:    { badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',       dot: 'bg-pink-500' },
  rose:    { badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',       dot: 'bg-rose-500' },
};

/** Get Tailwind classes for a tag color, with fallback to slate */
export function getTagColorClasses(color: string): { badge: string; dot: string } {
  return TAG_COLOR_MAP[color as TagColor] ?? TAG_COLOR_MAP.slate;
}

/**
 * Get Tailwind classes derived from a tag's name (deterministic).
 * This is the primary API — always prefer over getTagColorClasses(tag.color).
 */
export function getTagColorClassesByName(name: string): { badge: string; dot: string } {
  return TAG_COLOR_MAP[tagColorFromName(name)];
}
