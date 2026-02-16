'use server';

import { auth } from '@/auth';
import { ScopedDB } from '@/lib/db/scoped';

interface OverviewRawStats {
  totalLinks: number;
  totalClicks: number;
  totalUploads: number;
  totalStorageBytes: number;
  clickTimestamps: Date[];
  topLinks: { slug: string; originalUrl: string; clicks: number }[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get aggregated overview stats for the current user.
 * Returns link counts, click trends, top links, device/browser/OS breakdowns, and upload stats.
 */
export async function getOverviewStats(): Promise<ActionResult<OverviewRawStats>> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const db = new ScopedDB(userId);
    const stats = await db.getOverviewStats();
    return { success: true, data: stats };
  } catch (error) {
    console.error('Failed to get overview stats:', error);
    return { success: false, error: 'Failed to get overview stats' };
  }
}
