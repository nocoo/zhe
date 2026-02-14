import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

let mockViewModel = {
  collapsed: false,
  isMobile: false,
  mobileOpen: false,
  toggleSidebar: vi.fn(),
  closeMobileSidebar: vi.fn(),
};

vi.mock('@/viewmodels/useDashboardLayoutViewModel', () => ({
  useDashboardLayoutViewModel: () => mockViewModel,
}));

let mockPathname = '/dashboard';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn(), resolvedTheme: 'light' }),
}));

import { DashboardShell } from '@/components/dashboard-shell';

function renderShell(props: Partial<Parameters<typeof DashboardShell>[0]> = {}) {
  const defaultProps = {
    user: { name: 'Test User', email: 'test@example.com', image: null },
    signOutAction: vi.fn(async () => {}),
    children: <div data-testid="child-content">Dashboard Content</div>,
    ...props,
  };
  return render(<DashboardShell {...defaultProps} />);
}

describe('DashboardShell', () => {
  beforeEach(() => {
    mockPathname = '/dashboard';
    mockViewModel = {
      collapsed: false,
      isMobile: false,
      mobileOpen: false,
      toggleSidebar: vi.fn(),
      closeMobileSidebar: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders children content', () => {
    renderShell();
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('renders header with title', () => {
    renderShell();
    expect(screen.getByRole('heading', { name: '链接管理' })).toBeInTheDocument();
  });

  it('renders ThemeToggle in header', () => {
    renderShell();
    expect(screen.getByTitle('Theme: system')).toBeInTheDocument();
  });

  it('renders GitHub link in header', () => {
    renderShell();
    const link = screen.getByTitle('GitHub');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://github.com/nocoo/zhe');
  });

  describe('desktop mode', () => {
    it('renders sidebar when not mobile', () => {
      mockViewModel.isMobile = false;
      mockViewModel.collapsed = false;
      const { container } = renderShell();

      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[260px]');
    });

    it('renders collapsed sidebar', () => {
      mockViewModel.isMobile = false;
      mockViewModel.collapsed = true;
      const { container } = renderShell();

      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[68px]');
    });

    it('does not show mobile menu button on desktop', () => {
      mockViewModel.isMobile = false;
      const { container } = renderShell();

      const header = container.querySelector('header');
      const headerButtons = header?.querySelectorAll('button');
      // Only the ThemeToggle button should be in the header
      const nonThemeButtons = Array.from(headerButtons || []).filter(
        (btn) => !btn.getAttribute('title')?.includes('Theme')
      );
      expect(nonThemeButtons.length).toBe(0);
    });
  });

  describe('mobile mode', () => {
    it('does not render sidebar inline when mobile and drawer is closed', () => {
      mockViewModel.isMobile = true;
      mockViewModel.mobileOpen = false;
      const { container } = renderShell();

      const aside = container.querySelector('aside');
      expect(aside).toBeNull();
    });

    it('shows mobile menu button', () => {
      mockViewModel.isMobile = true;
      const { container } = renderShell();

      const header = container.querySelector('header');
      const headerButtons = header?.querySelectorAll('button');
      const nonThemeButtons = Array.from(headerButtons || []).filter(
        (btn) => !btn.getAttribute('title')?.includes('Theme')
      );
      expect(nonThemeButtons.length).toBe(1);
    });

    it('calls toggleSidebar when mobile menu button is clicked', () => {
      mockViewModel.isMobile = true;
      const { container } = renderShell();

      const header = container.querySelector('header');
      const headerButtons = header?.querySelectorAll('button');
      const menuButton = Array.from(headerButtons || []).find(
        (btn) => !btn.getAttribute('title')?.includes('Theme')
      );
      fireEvent.click(menuButton!);
      expect(mockViewModel.toggleSidebar).toHaveBeenCalledOnce();
    });

    it('renders mobile overlay and sidebar when drawer is open', () => {
      mockViewModel.isMobile = true;
      mockViewModel.mobileOpen = true;
      const { container } = renderShell();

      // Should render an overlay backdrop
      const overlay = container.querySelector('.bg-black\\/50');
      expect(overlay).toBeInTheDocument();

      // Should render sidebar in the drawer
      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
    });

    it('calls closeMobileSidebar when overlay is clicked', () => {
      mockViewModel.isMobile = true;
      mockViewModel.mobileOpen = true;
      const { container } = renderShell();

      const overlay = container.querySelector('.bg-black\\/50');
      fireEvent.click(overlay!);
      expect(mockViewModel.closeMobileSidebar).toHaveBeenCalledOnce();
    });
  });
});
