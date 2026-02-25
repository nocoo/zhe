import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/dashboard/backy-page', () => ({
  BackyPage: () => <div>BackyPage</div>,
}));

import BackyRoute from '@/app/(dashboard)/dashboard/backy/page';

describe('BackyRoute', () => {
  it('renders BackyPage component', () => {
    render(<BackyRoute />);

    expect(screen.getByText('BackyPage')).toBeInTheDocument();
  });
});
