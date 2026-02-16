// Pure business logic for overview / dashboard stats — no React, no server dependencies.

/** A single day's click count for trend charts */
export interface ClickTrendPoint {
  date: string; // YYYY-MM-DD
  clicks: number;
}

/** A link entry for the "top links" list */
export interface TopLinkEntry {
  slug: string;
  originalUrl: string;
  clicks: number;
}

/** Aggregated stats for the overview page */
export interface OverviewStats {
  totalLinks: number;
  totalClicks: number;
  totalUploads: number;
  totalStorageBytes: number;
  clickTrend: ClickTrendPoint[];
  topLinks: TopLinkEntry[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}

/** Format a click count for display: 1500 → "1.5K", 2500000 → "2.5M" */
export function formatClickCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/** Format a byte size for display: 1536 → "1.5 KB" */
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i === 0) return `${bytes} B`;
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Build a click trend from an array of click timestamps.
 * Groups by date (YYYY-MM-DD) and sorts ascending.
 */
export function buildClickTrend(timestamps: Date[]): ClickTrendPoint[] {
  if (timestamps.length === 0) return [];

  const byDate = new Map<string, number>();
  for (const ts of timestamps) {
    const date = ts.toISOString().slice(0, 10);
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }

  return Array.from(byDate.entries())
    .map(([date, clicks]) => ({ date, clicks }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
