import { useState, useEffect } from 'react';
import { getOverviewStats } from '@/actions/overview';
import { getWorkerHealth } from '@/actions/worker-status';
import type { OverviewStats, WorkerHealthStatus } from '@/models/overview';

export interface OverviewViewModelState {
  loading: boolean;
  error: string | null;
  stats: OverviewStats | null;
  workerHealth: WorkerHealthStatus | null;
  workerHealthLoading: boolean;
}

/**
 * ViewModel for the overview / dashboard page.
 * When `initialData` is provided (SSR prefetch), skips the client-side fetch.
 */
export function useOverviewViewModel(initialData?: OverviewStats): OverviewViewModelState {
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(initialData ?? null);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthStatus | null>(null);
  const [workerHealthLoading, setWorkerHealthLoading] = useState(true);

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

  // Fetch worker health independently (non-blocking for main stats)
  useEffect(() => {
    let cancelled = false;

    async function loadWorkerHealth() {
      try {
        const result = await getWorkerHealth();
        if (cancelled) return;

        if (result.success && result.data) {
          setWorkerHealth(result.data);
        }
      } catch {
        // Worker health is non-critical — silently ignore errors
      } finally {
        if (!cancelled) {
          setWorkerHealthLoading(false);
        }
      }
    }

    void loadWorkerHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, error, stats, workerHealth, workerHealthLoading };
}
