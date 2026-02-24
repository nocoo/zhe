import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { FoldersViewModel } from '@/viewmodels/useFoldersViewModel';

let mockFoldersVm: FoldersViewModel = {
  folders: [],
  editingFolderId: null,
  isCreating: false,
  setIsCreating: vi.fn(),
  handleCreateFolder: vi.fn(),
  handleUpdateFolder: vi.fn(),
  handleDeleteFolder: vi.fn(),
  startEditing: vi.fn(),
  cancelEditing: vi.fn(),
};

vi.mock('@/viewmodels/useFoldersViewModel', () => ({
  useFoldersViewModel: () => mockFoldersVm,
}));

// Mock getLinks for DashboardServiceProvider
vi.mock('@/actions/links', () => ({
  getLinks: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

// Mock folders actions to prevent next-auth import chain
vi.mock('@/actions/folders', () => ({
  getFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

// Mock DashboardService context
vi.mock('@/contexts/dashboard-service', () => ({
  useDashboardService: () => ({
    links: [],
    folders: [],
    tags: [],
    linkTags: [],
    loading: false,
    siteUrl: 'https://zhe.to',
    handleLinkCreated: vi.fn(),
    handleLinkDeleted: vi.fn(),
    handleLinkUpdated: vi.fn(),
    refreshLinks: vi.fn().mockResolvedValue(undefined),
    handleFolderCreated: vi.fn(),
    handleFolderDeleted: vi.fn(),
    handleFolderUpdated: vi.fn(),
    handleTagCreated: vi.fn(),
    handleTagDeleted: vi.fn(),
    handleTagUpdated: vi.fn(),
    handleLinkTagAdded: vi.fn(),
    handleLinkTagRemoved: vi.fn(),
  }),
  DashboardServiceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({
    get: () => null,
  }),
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

async function renderShell(props: Partial<Parameters<typeof DashboardShell>[0]> = {}) {
  const { act } = await import('@testing-library/react');
  const defaultProps = {
    user: { name: 'Test User', email: 'test@example.com', image: null },
    signOutAction: vi.fn(async () => {}),
    children: <div data-testid="child-content">Dashboard Content</div>,
    ...props,
  };
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<DashboardShell {...defaultProps} />);
  });
  return result!;
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
    mockFoldersVm = {
      folders: [],
      editingFolderId: null,
      isCreating: false,
      setIsCreating: vi.fn(),
      handleCreateFolder: vi.fn(),
      handleUpdateFolder: vi.fn(),
      handleDeleteFolder: vi.fn(),
      startEditing: vi.fn(),
      cancelEditing: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders children content', async () => {
    await renderShell();
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('renders header with title', async () => {
    await renderShell();
    expect(screen.getByRole('heading', { name: '链接管理' })).toBeInTheDocument();
  });

  it('renders header with 文件管理 title on uploads page', async () => {
    mockPathname = '/dashboard/uploads';
    await renderShell();
    expect(screen.getByRole('heading', { name: '文件管理' })).toBeInTheDocument();
  });

  it('renders header with 概览 title on overview page', async () => {
    mockPathname = '/dashboard/overview';
    await renderShell();
    expect(screen.getByRole('heading', { name: '概览' })).toBeInTheDocument();
  });

  it('renders header with 数据管理 title on data management page', async () => {
    mockPathname = '/dashboard/data-management';
    await renderShell();
    expect(screen.getByRole('heading', { name: '数据管理' })).toBeInTheDocument();
  });

  it('renders header with Webhook title on webhook page', async () => {
    mockPathname = '/dashboard/webhook';
    await renderShell();
    expect(screen.getByRole('heading', { name: 'Webhook' })).toBeInTheDocument();
  });

  it('renders ThemeToggle in header', async () => {
    await renderShell();
    expect(screen.getByTitle('Theme: system')).toBeInTheDocument();
  });

  it('renders GitHub link in header', async () => {
    await renderShell();
    const link = screen.getByTitle('GitHub');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://github.com/nocoo/zhe');
  });

  describe('desktop mode', () => {
    it('renders sidebar when not mobile', async () => {
      mockViewModel.isMobile = false;
      mockViewModel.collapsed = false;
      const { container } = await renderShell();

      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[260px]');
    });

    it('renders collapsed sidebar', async () => {
      mockViewModel.isMobile = false;
      mockViewModel.collapsed = true;
      const { container } = await renderShell();

      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[68px]');
    });

    it('does not show mobile menu button on desktop', async () => {
      mockViewModel.isMobile = false;
      const { container } = await renderShell();

      const header = container.querySelector('header');
      const headerButtons = header?.querySelectorAll('button');
      // Only the ThemeToggle button should be in the header
      const nonThemeButtons = Array.from(headerButtons || []).filter(
        (btn: Element) => !btn.getAttribute('title')?.includes('Theme')
      );
      expect(nonThemeButtons.length).toBe(0);
    });
  });

  describe('mobile mode', () => {
    it('does not render sidebar inline when mobile and drawer is closed', async () => {
      mockViewModel.isMobile = true;
      mockViewModel.mobileOpen = false;
      const { container } = await renderShell();

      const aside = container.querySelector('aside');
      expect(aside).toBeNull();
    });

    it('shows mobile menu button', async () => {
      mockViewModel.isMobile = true;
      const { container } = await renderShell();

      const header = container.querySelector('header');
      const headerButtons = header?.querySelectorAll('button');
      const nonThemeButtons = Array.from(headerButtons || []).filter(
        (btn: Element) => !btn.getAttribute('title')?.includes('Theme')
      );
      expect(nonThemeButtons.length).toBe(1);
    });

    it('calls toggleSidebar when mobile menu button is clicked', async () => {
      mockViewModel.isMobile = true;
      const { container } = await renderShell();

      const header = container.querySelector('header');
      const headerButtons = header?.querySelectorAll('button');
      const menuButton = Array.from(headerButtons || []).find(
        (btn: Element) => !btn.getAttribute('title')?.includes('Theme')
      );
      fireEvent.click(menuButton!);
      expect(mockViewModel.toggleSidebar).toHaveBeenCalledOnce();
    });

    it('renders mobile overlay and sidebar when drawer is open', async () => {
      mockViewModel.isMobile = true;
      mockViewModel.mobileOpen = true;
      const { container } = await renderShell();

      // Should render an overlay backdrop
      const overlay = container.querySelector('.bg-black\\/50');
      expect(overlay).toBeInTheDocument();

      // Should render sidebar in the drawer
      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
    });

    it('calls closeMobileSidebar when overlay is clicked', async () => {
      mockViewModel.isMobile = true;
      mockViewModel.mobileOpen = true;
      const { container } = await renderShell();

      const overlay = container.querySelector('.bg-black\\/50');
      fireEvent.click(overlay!);
      expect(mockViewModel.closeMobileSidebar).toHaveBeenCalledOnce();
    });
  });

  describe('folder props passthrough', () => {
    const mockFolders = [
      { id: 'f1', userId: 'u1', name: '工作', icon: 'briefcase', createdAt: new Date('2026-01-01') },
    ];

    it('passes folders to AppSidebar in expanded desktop mode', async () => {
      mockViewModel.isMobile = false;
      mockViewModel.collapsed = false;
      mockFoldersVm.folders = mockFolders;
      await renderShell();

      // If folders are passed through, the folder name should appear in sidebar
      expect(screen.getByText('工作')).toBeInTheDocument();
    });

    it('passes folders to AppSidebar in collapsed desktop mode', async () => {
      mockViewModel.isMobile = false;
      mockViewModel.collapsed = true;
      mockFoldersVm.folders = mockFolders;
      const { container } = await renderShell();

      // In collapsed mode, all items are links: 1 overview + 2 folder nav + 1 dynamic + 5 static = 9
      const navLinks = container.querySelectorAll('nav a');
      expect(navLinks.length).toBe(9);
    });

    it('passes folders to mobile sidebar when open', async () => {
      mockViewModel.isMobile = true;
      mockViewModel.mobileOpen = true;
      mockFoldersVm.folders = mockFolders;
      await renderShell();

      expect(screen.getByText('工作')).toBeInTheDocument();
    });
  });
});
