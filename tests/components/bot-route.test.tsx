import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/dashboard/bot-page', () => ({
  BotPage: () => <div>BotPage</div>,
}));

import BotRoute from '@/app/(dashboard)/dashboard/bot/page';

describe('BotRoute', () => {
  it('renders BotPage component', () => {
    render(<BotRoute />);

    expect(screen.getByText('BotPage')).toBeInTheDocument();
  });
});
