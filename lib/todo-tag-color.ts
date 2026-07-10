/**
 * Deterministic colour derivation for free-form todo tags.
 *
 * A todo tag is just a string (see docs/21-todos-feature.md — "Free-form
 * tags, hash colour"). Colour is a pure function of the (lower-cased) name so
 * the same tag renders identically across sessions and users without any
 * persistence. The hue comes from a 32-bit FNV-1a hash; saturation and
 * lightness are fixed so the palette stays cohesive and every text/background
 * combination hits WCAG AA contrast in both light and dark mode.
 */

/**
 * 32-bit FNV-1a hash. Small, deterministic, no dependency; the exact hash
 * function is not load-bearing but *must* be stable — changing it would
 * shuffle every user's existing tag colours.
 */
function fnv1a(input: string): number {
  let hash = 0x811c_9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // Math.imul keeps the multiplication 32-bit-safe on JS numbers.
    hash = Math.imul(hash, 0x0100_0193);
  }
  // Fold to a positive 32-bit integer.
  return hash >>> 0;
}

export interface TodoTagColor {
  /** Chip background (soft tint of the hue). */
  bg: string;
  /** Chip foreground / text (dark version of the hue for contrast). */
  fg: string;
  /** Chip border (mid-tone of the hue). */
  border: string;
}

/**
 * Return the coloured chip tokens for a free-form todo tag name.
 *
 * The name is lower-cased before hashing so `"Urgent"` and `"urgent"` collide
 * (same visual identity for the same conceptual tag). Empty / whitespace-only
 * names still produce a valid triple; the palette carousel is 360 wide, so
 * every distinct hash lands somewhere.
 */
export function todoTagColor(name: string): TodoTagColor {
  const normalised = name.trim().toLowerCase();
  const hue = fnv1a(normalised) % 360;
  return {
    bg: `hsl(${hue} 60% 92%)`,
    fg: `hsl(${hue} 45% 25%)`,
    border: `hsl(${hue} 55% 70%)`,
  };
}

// Internal export for direct testing of the hash — behaviour must not change.
export const __fnv1aForTests = fnv1a;
