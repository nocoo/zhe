import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/dashboard/overview-page', () => ({
  OverviewPage: () => <div>Overview</div>,
}));

import OverviewRoute from '@/app/(dashboard)/dashboard/overview/page';

describe('OverviewRoute', () => {
  it('renders OverviewPage component', () => {
    render(<OverviewRoute />);

    expect(screen.getByText('Overview')).toBeInTheDocument();
  });
});
