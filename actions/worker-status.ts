'use server';

import { getSession } from '@/lib/auth-context';
import { getCronHistory } from '@/lib/cron-history';
import { deriveWorkerHealth } from '@/models/overview';
import type { WorkerHealthStatus } from '@/models/overview';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get Worker health status for the overview dashboard.
 * Reads from in-memory cron history buffer — no external API calls.
 */
export async function getWorkerHealth(): Promise<ActionResult<WorkerHealthStatus>> {
  try {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const history = getCronHistory();
    const health = deriveWorkerHealth(history);
    return { success: true, data: health };
  } catch (error) {
    console.error('Failed to get worker health:', error);
    return { success: false, error: 'Failed to get worker health' };
  }
}
