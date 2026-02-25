import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/actions/webhook', () => ({
  getWebhookToken: vi.fn().mockResolvedValue({ success: false }),
}));

vi.mock('@/components/dashboard/webhook-page', () => ({
  WebhookPage: ({ initialData }: { initialData?: unknown }) => (
    <div>WebhookPage{initialData ? ' with data' : ''}</div>
  ),
}));

import WebhookRoute from '@/app/(dashboard)/dashboard/webhook/page';
import { getWebhookToken } from '@/actions/webhook';

describe('WebhookRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders WebhookPage with prefetched data', async () => {
    vi.mocked(getWebhookToken).mockResolvedValue({
      success: true,
      data: { token: 'tok_abc123', createdAt: new Date('2026-01-01T00:00:00Z'), rateLimit: 100 },
    });

    const jsx = await WebhookRoute();
    render(jsx);

    expect(screen.getByText('WebhookPage with data')).toBeInTheDocument();
    expect(getWebhookToken).toHaveBeenCalledOnce();
  });

  it('renders WebhookPage without data on failure', async () => {
    vi.mocked(getWebhookToken).mockResolvedValue({ success: false, error: 'Unauthorized' });

    const jsx = await WebhookRoute();
    render(jsx);

    expect(screen.getByText('WebhookPage')).toBeInTheDocument();
  });
});
