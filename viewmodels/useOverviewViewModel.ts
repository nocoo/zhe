import { useState, useEffect, useRef } from 'react';
import { getOverviewStats } from '@/actions/overview';
import { getWorkerHealth } from '@/actions/worker-status';
import type { OverviewStats, WorkerHealthStatus } from '@/models/overview';

/** How long data is considered fresh (5 minutes). */
export const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Module-level cache so data survives component unmount/remount
 * (e.g. user navigates to links list, then back to overview).
 */
export interface OverviewCache {
  stats: OverviewStats | null;
  fetchedAt: number; // Date.now() when data was last fetched
}

export let _cache: OverviewCache = { stats: null, fetchedAt: 0 };

/** Reset cache — exposed for testing. */
export function _resetCache(): void {
  _cache = { stats: null, fetchedAt: 0 };
}

export interface OverviewViewModelState {
  loading: boolean;
  error: string | null;
  stats: OverviewStats | null;
  workerHealth: WorkerHealthStatus | null;
  workerHealthLoading: boolean;
  /** Whether a background revalidation is in progress. */
  revalidating: boolean;
}

/**
 * ViewModel for the overview / dashboard page.
 *
 * Implements stale-while-revalidate:
 * - When `initialData` is provided (SSR prefetch), it's used immediately and
 *   the cache is updated.
 * - On subsequent mounts (e.g. navigating back), if the cached data is older
 *   than 5 minutes, the stale data is shown instantly while a background
 *   refresh runs. Fresh data replaces stale data seamlessly — no loading
 *   skeleton shown.
 */
export function useOverviewViewModel(initialData?: OverviewStats): OverviewViewModelState {
  // Determine initial state from cache or initialData
  const hasInitial = initialData !== undefined;
  const hasCached = _cache.stats !== null;

  // SSR initialData is always fresh — use it immediately and update cache
  if (hasInitial) {
    _cache.stats = initialData;
    _cache.fetchedAt = Date.now();
  }

  const seedStats = hasInitial ? initialData : hasCached ? _cache.stats : null;
  const needsFetch = !hasInitial && !hasCached;

  const [loading, setLoading] = useState(needsFetch);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(seedStats);
  const [revalidating, setRevalidating] = useState(false);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthStatus | null>(null);
  const [workerHealthLoading, setWorkerHealthLoading] = useState(true);

  // Track whether a fetch is in flight to avoid double-fetching
  const fetchingRef = useRef(false);

  // Primary data fetch / revalidation
  useEffect(() => {
    // If we have fresh initialData from SSR, no client fetch needed
    if (hasInitial) return;

    const isStale = hasCached && (Date.now() - _cache.fetchedAt) > STALE_THRESHOLD_MS;

    // If we have cached data that's still fresh, skip fetch
    if (hasCached && !isStale) return;

    // Either no cache (needsFetch) or stale cache (revalidate)
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    let cancelled = false;

    if (isStale) {
      setRevalidating(true);
    }

    async function load() {
      try {
        const result = await getOverviewStats();
        if (cancelled) return;

        if (!result.success || !result.data) {
          // On revalidation failure, keep showing stale data
          if (!isStale) {
            setError(result.error ?? '加载概览数据失败');
            setStats(null);
          }
        } else {
          setStats(result.data);
          setError(null);
          _cache.stats = result.data;
          _cache.fetchedAt = Date.now();
        }
      } catch {
        if (!cancelled && !isStale) {
          setError('加载概览数据失败');
          setStats(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRevalidating(false);
          fetchingRef.current = false;
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      fetchingRef.current = false;
    };
  }, [hasInitial, hasCached, needsFetch]);

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

  return { loading, error, stats, workerHealth, workerHealthLoading, revalidating };
}
