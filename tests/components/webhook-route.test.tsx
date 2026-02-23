import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/dashboard/webhook-page', () => ({
  WebhookPage: () => <div>Webhook</div>,
}));

import WebhookRoute from '@/app/(dashboard)/dashboard/webhook/page';

describe('WebhookRoute', () => {
  it('renders WebhookPage component', () => {
    render(<WebhookRoute />);

    expect(screen.getByText('Webhook')).toBeInTheDocument();
  });
});
