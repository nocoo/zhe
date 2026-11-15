// Centralized chart / visualization color palette.
// Keep chart series independent from the application accent.
import { CHART_COLORS as BASALT_CHART_COLORS } from "@nocoo/basalt/charts/chart-colors";

/** Helper — wraps a CSS custom property name for inline style usage. */
const v = (token: string) => `hsl(var(--${token}))`;

/**
 * Returns a CSS color string with alpha from a CSS custom property.
 * Usage: `withAlpha("chart-1", 0.12)` → `hsl(var(--chart-1) / 0.12)`
 */
export const withAlpha = (token: string, alpha: number) => `hsl(var(--${token}) / ${alpha})`;

// ── Basalt fixed chart palette ──
/** Ordered array — use for pie / donut / bar with modulo indexing. */
export const CHART_COLORS = BASALT_CHART_COLORS;

// ── Semantic aliases ──

/** Axis labels, gridlines — neutral gray, distinct from categorical hues. */
export const chartAxis = v("basalt-chart-axis");
