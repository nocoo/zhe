import { useState, useEffect } from 'react';
import { getOverviewStats } from '@/actions/overview';
import type { OverviewStats } from '@/models/overview';

export interface OverviewViewModelState {
  loading: boolean;
  error: string | null;
  stats: OverviewStats | null;
}

/**
 * ViewModel for the overview / dashboard page.
 * When `initialData` is provided (SSR prefetch), skips the client-side fetch.
 */
export function useOverviewViewModel(initialData?: OverviewStats): OverviewViewModelState {
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(initialData ?? null);

  useEffect(() => {
    if (initialData) return;

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

          setStats({
            totalLinks: raw.totalLinks,
            totalClicks: raw.totalClicks,
            totalUploads: raw.totalUploads,
            totalStorageBytes: raw.totalStorageBytes,
            clickTrend: raw.clickTrend,
            uploadTrend: raw.uploadTrend,
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
  }, [initialData]);

  return { loading, error, stats };
}
