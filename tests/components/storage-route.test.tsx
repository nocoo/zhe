import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/actions/storage', () => ({
  scanStorage: vi.fn().mockResolvedValue({ success: false }),
}));

vi.mock('@/components/dashboard/storage-page', () => ({
  StoragePage: ({ initialData }: { initialData?: unknown }) => (
    <div>StoragePage{initialData ? ' with data' : ''}</div>
  ),
}));

import StorageRoute from '@/app/(dashboard)/dashboard/storage/page';
import { scanStorage } from '@/actions/storage';

describe('StorageRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders StoragePage with prefetched data on success', async () => {
    vi.mocked(scanStorage).mockResolvedValue({
      success: true,
      data: {
        d1: {
          connected: true,
          totalLinks: 5,
          totalUploads: 3,
          totalAnalytics: 100,
          tables: [],
        },
        r2: {
          connected: true,
          summary: { totalFiles: 2, totalSize: 1024, orphanFiles: 0, orphanSize: 0 },
          files: [],
        },
      },
    });

    const jsx = await StorageRoute();
    render(jsx);

    expect(screen.getByText('StoragePage with data')).toBeInTheDocument();
    expect(scanStorage).toHaveBeenCalledOnce();
  });

  it('renders StoragePage without data on failure', async () => {
    vi.mocked(scanStorage).mockResolvedValue({ success: false });

    const jsx = await StorageRoute();
    render(jsx);

    expect(screen.getByText('StoragePage')).toBeInTheDocument();
    expect(scanStorage).toHaveBeenCalledOnce();
  });
});
