/**
 * Overview stats for ScopedDB (cross-domain aggregates).
 */

import { executeD1Query } from '../d1-client';

export interface OverviewStats {
  totalLinks: number;
  totalClicks: number;
  totalUploads: number;
  totalStorageBytes: number;
  clickTrend: { date: string; clicks: number; origin: number; worker: number }[];
  uploadTrend: { date: string; uploads: number }[];
  topLinks: { slug: string; originalUrl: string; clicks: number }[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
  fileTypeBreakdown: Record<string, number>;
}

function rowsToBreakdown(rows: Record<string, unknown>[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r[key] as string] = r.count as number;
  return out;
}

async function fetchOverviewRows(userId: string) {
  const analyticsJoin = 'FROM analytics a JOIN links l ON a.link_id = l.id WHERE l.user_id = ?';
  const analyticsParams = [userId];

  return Promise.all([
    executeD1Query<Record<string, unknown>>(
      'SELECT COUNT(*) AS total_links, COALESCE(SUM(clicks), 0) AS total_clicks FROM links WHERE user_id = ?',
      [userId],
    ),
    executeD1Query<Record<string, unknown>>(
      'SELECT slug, original_url, clicks FROM links WHERE user_id = ? ORDER BY clicks DESC',
      [userId],
    ),
    executeD1Query<Record<string, unknown>>(
      'SELECT COUNT(*) AS total_uploads, COALESCE(SUM(file_size), 0) AS total_storage FROM uploads WHERE user_id = ?',
      [userId],
    ),
    executeD1Query<Record<string, unknown>>(
      `SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as uploads FROM uploads WHERE user_id = ? GROUP BY date ORDER BY date ASC`,
      [userId],
    ),
    executeD1Query<Record<string, unknown>>(
      'SELECT file_type, COUNT(*) as count FROM uploads WHERE user_id = ? GROUP BY file_type',
      [userId],
    ),
    executeD1Query<Record<string, unknown>>(
      `SELECT date(a.created_at / 1000, 'unixepoch') as date, COUNT(*) as clicks, SUM(CASE WHEN a.source = 'origin' OR a.source IS NULL THEN 1 ELSE 0 END) as origin_clicks, SUM(CASE WHEN a.source = 'worker' THEN 1 ELSE 0 END) as worker_clicks ${analyticsJoin} GROUP BY date ORDER BY date ASC`,
      analyticsParams,
    ),
    executeD1Query<Record<string, unknown>>(
      `SELECT a.device, COUNT(*) as count ${analyticsJoin} AND a.device IS NOT NULL GROUP BY a.device`,
      analyticsParams,
    ),
    executeD1Query<Record<string, unknown>>(
      `SELECT a.browser, COUNT(*) as count ${analyticsJoin} AND a.browser IS NOT NULL GROUP BY a.browser`,
      analyticsParams,
    ),
    executeD1Query<Record<string, unknown>>(
      `SELECT a.os, COUNT(*) as count ${analyticsJoin} AND a.os IS NOT NULL GROUP BY a.os`,
      analyticsParams,
    ),
  ]);
}

export async function getOverviewStats(userId: string): Promise<OverviewStats> {
  const [
    linkStatsRows,
    topLinkRows,
    uploadStatsRows,
    uploadTrendRows,
    fileTypeRows,
    clickTrendRows,
    deviceRows,
    browserRows,
    osRows,
  ] = await fetchOverviewRows(userId);

  const totalLinks = (linkStatsRows[0]?.total_links as number) ?? 0;
  const totalClicks = (linkStatsRows[0]?.total_clicks as number) ?? 0;
  const totalUploads = (uploadStatsRows[0]?.total_uploads as number) ?? 0;
  const totalStorageBytes = (uploadStatsRows[0]?.total_storage as number) ?? 0;

  const topLinks = topLinkRows.map(r => ({
    slug: r.slug as string,
    originalUrl: r.original_url as string,
    clicks: (r.clicks as number) ?? 0,
  }));
  const uploadTrend = uploadTrendRows.map(r => ({
    date: r.date as string,
    uploads: r.uploads as number,
  }));
  const clickTrend = clickTrendRows.map(r => ({
    date: r.date as string,
    clicks: r.clicks as number,
    origin: (r.origin_clicks as number) ?? 0,
    worker: (r.worker_clicks as number) ?? 0,
  }));

  return {
    totalLinks,
    totalClicks,
    totalUploads,
    totalStorageBytes,
    clickTrend,
    uploadTrend,
    topLinks,
    deviceBreakdown: rowsToBreakdown(deviceRows, 'device'),
    browserBreakdown: rowsToBreakdown(browserRows, 'browser'),
    osBreakdown: rowsToBreakdown(osRows, 'os'),
    fileTypeBreakdown: rowsToBreakdown(fileTypeRows, 'file_type'),
  };
}
