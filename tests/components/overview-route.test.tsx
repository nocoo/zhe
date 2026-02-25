import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/actions/overview', () => ({
  getOverviewStats: vi.fn().mockResolvedValue({ success: false }),
}));

vi.mock('@/components/dashboard/overview-page', () => ({
  OverviewPage: ({ initialData }: { initialData?: unknown }) => (
    <div>Overview{initialData ? ' with data' : ''}</div>
  ),
}));

import OverviewRoute from '@/app/(dashboard)/dashboard/overview/page';
import { getOverviewStats } from '@/actions/overview';

describe('OverviewRoute', () => {
  it('renders OverviewPage with prefetched data', async () => {
    vi.mocked(getOverviewStats).mockResolvedValue({
      success: true,
      data: { totalLinks: 1 } as never,
    });

    const jsx = await OverviewRoute();
    render(jsx);

    expect(screen.getByText('Overview with data')).toBeInTheDocument();
    expect(getOverviewStats).toHaveBeenCalledOnce();
  });

  it('renders OverviewPage without data on failure', async () => {
    vi.mocked(getOverviewStats).mockResolvedValue({
      success: false,
      error: 'Unauthorized',
    });

    const jsx = await OverviewRoute();
    render(jsx);

    expect(screen.getByText('Overview')).toBeInTheDocument();
  });
});
