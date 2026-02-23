import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/dashboard/data-management-page', () => ({
  DataManagementPage: () => <div>DataManagement</div>,
}));

import DataManagementRoute from '@/app/(dashboard)/dashboard/data-management/page';

describe('DataManagementRoute', () => {
  it('renders DataManagementPage component', () => {
    render(<DataManagementRoute />);

    expect(screen.getByText('DataManagement')).toBeInTheDocument();
  });
});
