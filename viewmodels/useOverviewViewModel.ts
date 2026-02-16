import { useState, useEffect } from 'react';
import { getOverviewStats } from '@/actions/overview';
import { buildClickTrend, buildUploadTrend } from '@/models/overview';
import type { OverviewStats } from '@/models/overview';

export interface OverviewViewModelState {
  loading: boolean;
  error: string | null;
  stats: OverviewStats | null;
}

/**
 * ViewModel for the overview / dashboard page.
 * Fetches aggregated stats on mount and transforms raw data into chart-ready shapes.
 */
export function useOverviewViewModel(): OverviewViewModelState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await getOverviewStats();
        if (cancelled) return;

        if (!result.success || !result.data) {
          setError(result.error ?? '加载概览数据失败');
          setStats(null);
        } else {
          const raw = result.data;
          const clickTrend = buildClickTrend(raw.clickTimestamps);
          const uploadTrend = buildUploadTrend(raw.uploadTimestamps);

          setStats({
            totalLinks: raw.totalLinks,
            totalClicks: raw.totalClicks,
            totalUploads: raw.totalUploads,
            totalStorageBytes: raw.totalStorageBytes,
            clickTrend,
            uploadTrend,
            topLinks: raw.topLinks,
            deviceBreakdown: raw.deviceBreakdown,
            browserBreakdown: raw.browserBreakdown,
            osBreakdown: raw.osBreakdown,
            fileTypeBreakdown: raw.fileTypeBreakdown,
          });
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('加载概览数据失败');
          setStats(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, error, stats };
}
