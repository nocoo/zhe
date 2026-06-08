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

// ── 12 categorical chart colors ──
//
// The full set is defined in globals.css under `--chart-1`..`--chart-12`,
// covering the hue wheel from brand purple through pink. For multi-series
// trio charts (e.g. ClickTrend total/worker/origin) prefer indices [0, 4, 8]
// — they sit roughly equidistant on the wheel, so adjacent series stay
// visually separable even when stacked with alpha.

/** Ordered array — use for pie / donut / bar where you need N colors by index. */
export const CHART_COLORS = Array.from(
  { length: 12 },
  (_, i) => v(`chart-${i + 1}`),
);

// ── Semantic aliases ──

/** Axis labels, gridlines — neutral gray, distinct from categorical hues. */
export const chartAxis = v("chart-axis");
