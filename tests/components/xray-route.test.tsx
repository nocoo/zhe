import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/actions/xray', () => ({
  getXrayConfig: vi.fn().mockResolvedValue({ success: false }),
}));

vi.mock('@/components/dashboard/xray-page', () => ({
  XrayPage: ({ initialData }: { initialData?: unknown }) => (
    <div>XrayPage{initialData ? ' with data' : ''}</div>
  ),
}));

import XrayRoute from '@/app/(dashboard)/dashboard/xray/page';
import { getXrayConfig } from '@/actions/xray';

describe('XrayRoute', () => {
  it('renders XrayPage with prefetched data', async () => {
    vi.mocked(getXrayConfig).mockResolvedValue({
      success: true,
      data: { apiUrl: 'https://api.example.com', maskedToken: 'sk-••••' },
    });

    const jsx = await XrayRoute();
    render(jsx);

    expect(screen.getByText('XrayPage with data')).toBeInTheDocument();
    expect(getXrayConfig).toHaveBeenCalledOnce();
  });

  it('renders XrayPage without data on failure', async () => {
    vi.mocked(getXrayConfig).mockResolvedValue({ success: false });

    const jsx = await XrayRoute();
    render(jsx);

    expect(screen.getByText('XrayPage')).toBeInTheDocument();
  });
});
