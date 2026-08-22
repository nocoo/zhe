// Pure business logic for tag operations — no React, no DOM.

/**
 * 12 semantic color names matching `--chart-1` … `--chart-12` in app/globals.css.
 * Hashing or storing a name outside this set used to emit `--chart-13+`,
 * which is undefined CSS and renders as a near-white / invisible badge.
 */
export const TAG_PALETTE = [
  "primary", // --chart-1   262 83% 58%   brand purple
  "sky", // --chart-2   200 90% 55%
  "teal", // --chart-3   186 80% 45%
  "jade", // --chart-4   166 72% 44%
  "green", // --chart-5   142 71% 45%
  "lime", // --chart-6   84 65% 46%
  "amber", // --chart-7   45 93% 47%
  "orange", // --chart-8   30 90% 55%
  "vermilion", // --chart-9   15 85% 52%
  "red", // --chart-10  0 72% 51%
  "rose", // --chart-11  340 82% 55%
  "magenta", // --chart-12  290 65% 55%
] as const;

export type TagPaletteColor = (typeof TAG_PALETTE)[number];

const MAX_TAG_NAME_LENGTH = 30;
const PALETTE_SIZE = TAG_PALETTE.length;

/** Check if a string is a valid palette color name */
export function isValidTagColor(color: string): color is TagPaletteColor {
  return (TAG_PALETTE as readonly string[]).includes(color);
}

/** Pick a random color from the palette */
export function randomTagColor(): TagPaletteColor {
  return TAG_PALETTE[Math.floor(Math.random() * PALETTE_SIZE)] ?? "primary";
}

/**
 * Stable FNV-1a-inspired hash that works with any Unicode string (CJK, emoji, etc.).
 * Returns a non-negative 32-bit integer.
 *
 * Why FNV-1a over djb2?
 * – Better avalanche (fewer collisions on short strings)
 * – XOR-then-multiply reduces clustering when modding by small N
 * – Deterministic and fast — no crypto overhead
 */
function fnv1aHash(str: string): number {
  let h = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime (32-bit)
  }
  return h >>> 0; // ensure unsigned
}

/**
 * Derive a deterministic palette color from a tag name.
 * Same name → same color, everywhere, always.
 */
export function tagColorFromName(name: string): TagPaletteColor {
  return TAG_PALETTE[fnv1aHash(name) % PALETTE_SIZE] ?? "primary";
}

/**
 * Prefer a stored palette color; fall back to a name hash when missing/invalid.
 * Invalid leftovers (old 24-color names, hex) never emit an undefined CSS var.
 */
export function resolveTagColor(name: string, color?: string | null): TagPaletteColor {
  if (color && isValidTagColor(color)) return color;
  return tagColorFromName(name);
}

/**
 * Get the CSS variable token for a tag (1-indexed, always chart-1 … chart-12).
 * e.g. "primary" → "chart-1", "sky" → "chart-2"
 */
export function tagColorToken(name: string, color?: string | null): string {
  const idx = TAG_PALETTE.indexOf(resolveTagColor(name, color));
  return `chart-${idx + 1}`;
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

/** Inline style objects for tag badge rendering using CSS variables. */
export interface TagColorStyles {
  /** Style for the badge container (background + text color) */
  badge: React.CSSProperties;
  /** Style for the dot indicator */
  dot: React.CSSProperties;
}

/**
 * Get inline style objects for a tag.
 * Uses stored `color` when it is a defined palette name; otherwise hashes `name`.
 * Tokens always resolve to `--chart-1` … `--chart-12`.
 */
export function getTagStyles(name: string, color?: string | null): TagColorStyles {
  const token = tagColorToken(name, color);
  return {
    badge: {
      backgroundColor: `hsl(var(--${token}) / 0.12)`,
      color: `hsl(var(--${token}))`,
    },
    dot: {
      backgroundColor: `hsl(var(--${token}))`,
    },
  };
}

/** Case-insensitive duplicate check. `excludeId` lets a rename keep its own name. */
export function isDuplicateTagName(
  name: string,
  tags: ReadonlyArray<{ id: string; name: string }>,
  excludeId?: string,
): boolean {
  const needle = name.trim().toLowerCase();
  if (!needle) return false;
  return tags.some((tag) => tag.id !== excludeId && tag.name.trim().toLowerCase() === needle);
}

// ── Backward-compat aliases (deprecated — migrate to getTagStyles) ──

/** @deprecated Use TAG_PALETTE instead */
export const TAG_COLORS = TAG_PALETTE;
/** @deprecated Use TagPaletteColor instead */
export type TagColor = TagPaletteColor;
/** @deprecated Use getTagStyles(name) instead */
export function getTagColorClassesByName(_name: string): { badge: string; dot: string } {
  // Return empty strings — callers should migrate to getTagStyles()
  return { badge: "", dot: "" };
}
/** @deprecated Use getTagStyles(name) instead */
export function getTagColorClasses(_color: string): { badge: string; dot: string } {
  return { badge: "", dot: "" };
}
