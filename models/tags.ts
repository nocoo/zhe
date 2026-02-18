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
