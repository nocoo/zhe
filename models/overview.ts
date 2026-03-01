// Pure business logic for overview / dashboard stats — no React, no server dependencies.

import type { CronHistoryEntry } from '@/lib/cron-history';

/** A single day's click count for trend charts */
export interface ClickTrendPoint {
  date: string; // YYYY-MM-DD
  clicks: number; // total clicks (origin + worker + legacy)
  origin: number; // clicks via middleware (D1 fallback)
  worker: number; // clicks via Cloudflare Worker (KV edge)
}

/** A single day's upload count for trend charts */
export interface UploadTrendPoint {
  date: string; // YYYY-MM-DD
  uploads: number;
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
  uploadTrend: UploadTrendPoint[];
  topLinks: TopLinkEntry[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
  fileTypeBreakdown: Record<string, number>;
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
 * Note: source breakdown defaults to 0 since raw timestamps carry no source info.
 */
export function buildClickTrend(timestamps: Date[]): ClickTrendPoint[] {
  if (timestamps.length === 0) return [];

  const byDate = new Map<string, number>();
  for (const ts of timestamps) {
    const date = ts.toISOString().slice(0, 10);
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }

  return Array.from(byDate.entries())
    .map(([date, clicks]) => ({ date, clicks, origin: 0, worker: 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Build an upload trend from an array of upload timestamps.
 * Groups by date (YYYY-MM-DD) and sorts ascending.
 */
export function buildUploadTrend(timestamps: Date[]): UploadTrendPoint[] {
  if (timestamps.length === 0) return [];

  const byDate = new Map<string, number>();
  for (const ts of timestamps) {
    const date = ts.toISOString().slice(0, 10);
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }

  return Array.from(byDate.entries())
    .map(([date, uploads]) => ({ date, uploads }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Build a file type breakdown from an array of MIME types.
 * Returns a record mapping each type to its count.
 */
export function buildFileTypeBreakdown(fileTypes: string[]): Record<string, number> {
  if (fileTypes.length === 0) return {};

  const counts: Record<string, number> = {};
  for (const ft of fileTypes) {
    counts[ft] = (counts[ft] ?? 0) + 1;
  }
  return counts;
}

// ── Worker Health ──────────────────────────────────────────────────────────

/** Status data returned by /api/worker-status */
export interface WorkerHealthStatus {
  cronHistory: CronHistoryEntry[];
  lastSyncTime: string | null; // ISO 8601 of most recent successful sync
  kvKeyCount: number | null; // from last successful sync's `total` field
  syncSuccessRate: number | null; // 0–100 percentage
}

/** Derive WorkerHealthStatus from raw cron history entries. */
export function deriveWorkerHealth(history: CronHistoryEntry[]): WorkerHealthStatus {
  const lastSuccess = history.find((e) => e.status === 'success');

  const total = history.length;
  const successes = history.filter((e) => e.status === 'success').length;

  return {
    cronHistory: history,
    lastSyncTime: lastSuccess?.timestamp ?? null,
    kvKeyCount: lastSuccess?.total ?? null,
    syncSuccessRate: total > 0 ? Math.round((successes / total) * 100) : null,
  };
}

/** Format a relative time string: "3 分钟前", "2 小时前", etc. */
export function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return '刚刚';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return '刚刚';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}
