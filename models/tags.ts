// Pure business logic for tag operations — no React, no DOM.

/**
 * 24 semantic color names matching the basalt chart palette (--chart-1 … --chart-24).
 * Order must stay in sync with CSS custom properties in basalt/src/index.css.
 */
export const TAG_PALETTE = [
  'primary',   // --chart-1   217 91% 60%   brand blue
  'sky',       // --chart-2   200 90% 55%
  'teal',      // --chart-3   186 80% 45%
  'jade',      // --chart-4   166 72% 44%
  'green',     // --chart-5   142 71% 45%
  'lime',      // --chart-6   84 65% 46%
  'amber',     // --chart-7   45 93% 47%
  'orange',    // --chart-8   30 90% 55%
  'vermilion', // --chart-9   15 85% 52%
  'red',       // --chart-10  0 72% 51%
  'rose',      // --chart-11  340 82% 55%
  'magenta',   // --chart-12  320 70% 55%
  'orchid',    // --chart-13  290 65% 55%
  'purple',    // --chart-14  270 70% 60%
  'indigo',    // --chart-15  250 65% 58%
  'cobalt',    // --chart-16  230 70% 56%
  'steel',     // --chart-17  210 55% 50%
  'cadet',     // --chart-18  195 45% 55%
  'seafoam',   // --chart-19  160 50% 50%
  'olive',     // --chart-20  100 50% 48%
  'gold',      // --chart-21  60 65% 45%
  'tangerine', // --chart-22  22 80% 50%
  'crimson',   // --chart-23  350 65% 50%
  'gray',      // --chart-24  0 0% 25%
] as const;

export type TagPaletteColor = (typeof TAG_PALETTE)[number];

const MAX_TAG_NAME_LENGTH = 30;
const PALETTE_SIZE = TAG_PALETTE.length; // 24

/** Check if a string is a valid palette color name */
export function isValidTagColor(color: string): color is TagPaletteColor {
  return (TAG_PALETTE as readonly string[]).includes(color);
}

/** Pick a random color from the palette */
export function randomTagColor(): TagPaletteColor {
  return TAG_PALETTE[Math.floor(Math.random() * PALETTE_SIZE)];
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
  return TAG_PALETTE[fnv1aHash(name) % PALETTE_SIZE];
}

/**
 * Get the CSS variable token for a palette color (1-indexed).
 * e.g. "primary" → "chart-1", "sky" → "chart-2"
 */
export function tagColorToken(name: string): string {
  const idx = TAG_PALETTE.indexOf(tagColorFromName(name));
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
 * Get inline style objects for a tag, derived deterministically from its name.
 * Uses basalt --chart-N CSS variables so colors auto-adapt to light/dark theme.
 *
 * This is the primary API — use this everywhere tags are rendered.
 */
export function getTagStyles(name: string): TagColorStyles {
  const token = tagColorToken(name);
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

// ── Backward-compat aliases (deprecated — migrate to getTagStyles) ──

/** @deprecated Use TAG_PALETTE instead */
export const TAG_COLORS = TAG_PALETTE;
/** @deprecated Use TagPaletteColor instead */
export type TagColor = TagPaletteColor;
/** @deprecated Use getTagStyles(name) instead */
export function getTagColorClassesByName(_name: string): { badge: string; dot: string } {
  // Return empty strings — callers should migrate to getTagStyles()
  return { badge: '', dot: '' };
}
/** @deprecated Use getTagStyles(name) instead */
export function getTagColorClasses(_color: string): { badge: string; dot: string } {
  return { badge: '', dot: '' };
}
