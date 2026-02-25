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
          setStats(result.data);
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
