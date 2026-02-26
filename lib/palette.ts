// Centralized chart / visualization color palette.
// All values reference CSS custom properties defined in globals.css.

/** Helper — wraps a CSS custom property name for inline style usage. */
const v = (token: string) => `hsl(var(--${token}))`;

/**
 * Returns a CSS color string with alpha from a CSS custom property.
 * Usage: `withAlpha("chart-1", 0.12)` → `hsl(var(--chart-1) / 0.12)`
 */
export const withAlpha = (token: string, alpha: number) =>
  `hsl(var(--${token}) / ${alpha})`;

// ── 24 sequential chart colors ──

/** Ordered array — use for pie / donut / bar where you need N colors by index. */
export const CHART_COLORS = Array.from(
  { length: 24 },
  (_, i) => v(`chart-${i + 1}`),
);

// ── Semantic aliases ──

export const chartAxis = v("chart-axis");
