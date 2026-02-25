import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/dashboard/xray-page', () => ({
  XrayPage: () => <div>XrayPage</div>,
}));

import XrayRoute from '@/app/(dashboard)/dashboard/xray/page';

describe('XrayRoute', () => {
  it('renders XrayPage component', () => {
    render(<XrayRoute />);

    expect(screen.getByText('XrayPage')).toBeInTheDocument();
  });
});
