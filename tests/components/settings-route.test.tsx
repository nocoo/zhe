import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/dashboard/settings-page', () => ({
  SettingsPage: () => <div>Settings</div>,
}));

import SettingsRoute from '@/app/(dashboard)/dashboard/settings/page';

describe('SettingsRoute', () => {
  it('renders SettingsPage component', () => {
    render(<SettingsRoute />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
