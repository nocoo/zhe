'use server';

import { getSession } from '@/lib/auth-context';
import { getCronHistory } from '@/lib/cron-history';
import { performKVSync } from '@/lib/kv/sync';
import { deriveWorkerHealth } from '@/models/overview';
import type { WorkerHealthStatus } from '@/models/overview';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get Worker health status for the overview dashboard.
 *
 * If the in-memory cron history buffer is empty (e.g. right after deploy),
 * triggers a single KV sync first so the dashboard has data on first load.
 */
export async function getWorkerHealth(): Promise<ActionResult<WorkerHealthStatus>> {
  try {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Seed the buffer on first dashboard visit after deploy
    let history = getCronHistory();
    if (history.length === 0) {
      await performKVSync();
      history = getCronHistory();
    }

    const health = deriveWorkerHealth(history);
    return { success: true, data: health };
  } catch (error) {
    console.error('Failed to get worker health:', error);
    return { success: false, error: 'Failed to get worker health' };
  }
}
