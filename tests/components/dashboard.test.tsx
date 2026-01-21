import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from '@/app/(dashboard)/dashboard/page';

describe('Dashboard Page', () => {
  it('renders without crashing', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('displays placeholder content', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Your links will appear here')).toBeInTheDocument();
  });
});
