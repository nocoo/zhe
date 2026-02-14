import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock LinksList since the page is just a shell
vi.mock('@/components/dashboard/links-list', () => ({
  LinksList: () => <div data-testid="links-list">LinksList</div>,
}));

describe('Dashboard Page', () => {
  it('renders LinksList component', async () => {
    const { default: DashboardPage } = await import(
      '@/app/(dashboard)/dashboard/page'
    );
    render(<DashboardPage />);

    expect(screen.getByTestId('links-list')).toBeInTheDocument();
  });

  it('is not async (no server-side data fetching)', async () => {
    const { default: DashboardPage } = await import(
      '@/app/(dashboard)/dashboard/page'
    );
    // Page should be a regular function, not async
    const result = DashboardPage();
    expect(result).toBeDefined();
    // Should not be a promise
    expect(result).not.toBeInstanceOf(Promise);
  });
});
