import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/actions/upload', () => ({
  getUploads: vi.fn().mockResolvedValue({ success: false }),
}));

vi.mock('@/components/dashboard/upload-list', () => ({
  UploadList: ({ initialUploads }: { initialUploads?: unknown }) => (
    <div>UploadList{initialUploads ? ' with data' : ''}</div>
  ),
}));

import UploadsPage from '@/app/(dashboard)/dashboard/uploads/page';
import { getUploads } from '@/actions/upload';

describe('UploadsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders UploadList with prefetched data', async () => {
    vi.mocked(getUploads).mockResolvedValue({
      success: true,
      data: [{ id: '1', filename: 'test.png', url: 'https://example.com/test.png' }] as never,
    });

    const jsx = await UploadsPage();
    render(jsx);

    expect(screen.getByText('UploadList with data')).toBeInTheDocument();
    expect(getUploads).toHaveBeenCalledOnce();
  });

  it('renders UploadList without data on failure', async () => {
    vi.mocked(getUploads).mockResolvedValue({ success: false, error: 'Unauthorized' });

    const jsx = await UploadsPage();
    render(jsx);

    expect(screen.getByText('UploadList')).toBeInTheDocument();
  });
});
