/**
 * Analytics operations for ScopedDB (scoped through link ownership).
 */

import { executeD1Query } from '../d1-client';
import { rowToAnalytics } from '../mappers';
import type { Analytics } from '../schema';

export async function getAnalyticsByLinkId(
  userId: string,
  linkId: number,
): Promise<Analytics[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT a.* FROM analytics a
     JOIN links l ON a.link_id = l.id
     WHERE a.link_id = ? AND l.user_id = ?
     ORDER BY a.created_at DESC`,
    [linkId, userId],
  );
  return rows.map(rowToAnalytics);
}

export interface AnalyticsStats {
  totalClicks: number;
  uniqueCountries: string[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}

function rowsToBreakdown(
  rows: Record<string, unknown>[],
  key: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r[key] as string] = r.count as number;
  return out;
}

export async function getAnalyticsStats(
  userId: string,
  linkId: number,
): Promise<AnalyticsStats> {
  const ownershipJoin = 'JOIN links l ON a.link_id = l.id';
  const ownershipWhere = 'WHERE a.link_id = ? AND l.user_id = ?';
  const params = [linkId, userId];

  const [countRows, countryRows, deviceRows, browserRows, osRows] = await Promise.all([
    executeD1Query<Record<string, unknown>>(
      `SELECT COUNT(*) as total FROM analytics a ${ownershipJoin} ${ownershipWhere}`,
      params,
    ),
    executeD1Query<Record<string, unknown>>(
      `SELECT DISTINCT a.country FROM analytics a ${ownershipJoin} ${ownershipWhere} AND a.country IS NOT NULL`,
      params,
    ),
    executeD1Query<Record<string, unknown>>(
      `SELECT a.device, COUNT(*) as count FROM analytics a ${ownershipJoin} ${ownershipWhere} AND a.device IS NOT NULL GROUP BY a.device`,
      params,
    ),
    executeD1Query<Record<string, unknown>>(
      `SELECT a.browser, COUNT(*) as count FROM analytics a ${ownershipJoin} ${ownershipWhere} AND a.browser IS NOT NULL GROUP BY a.browser`,
      params,
    ),
    executeD1Query<Record<string, unknown>>(
      `SELECT a.os, COUNT(*) as count FROM analytics a ${ownershipJoin} ${ownershipWhere} AND a.os IS NOT NULL GROUP BY a.os`,
      params,
    ),
  ]);

  return {
    totalClicks: (countRows[0]?.total as number) ?? 0,
    uniqueCountries: countryRows.map(r => r.country as string),
    deviceBreakdown: rowsToBreakdown(deviceRows, 'device'),
    browserBreakdown: rowsToBreakdown(browserRows, 'browser'),
    osBreakdown: rowsToBreakdown(osRows, 'os'),
  };
}
