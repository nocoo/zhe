import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { FoldersViewModel } from '@/viewmodels/useFoldersViewModel';
import { unwrap } from '../test-utils';

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
  useDashboardState: () => ({
    links: [],
    folders: [],
    tags: [],
    linkTags: [],
    loading: false,
  }),
  useDashboardActions: () => ({
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

// Mock sidebar context — controls sidebar state for shell tests
let mockSidebarCtx = {
  collapsed: false,
  toggle: vi.fn(),
  setCollapsed: vi.fn(),
  isMobile: false,
  mobileOpen: false,
  setMobileOpen: vi.fn(),
};

vi.mock('@/components/sidebar-context', () => ({
  useSidebar: () => mockSidebarCtx,
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

import { AppShell } from '@/components/app-shell';

async function renderShell(props: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const { act } = await import('@testing-library/react');
  const defaultProps = {
    user: { name: 'Test User', email: 'test@example.com', image: null },
    signOutAction: vi.fn(async () => {}),
    children: <div data-testid="child-content">Dashboard Content</div>,
    ...props,
  };
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<AppShell {...defaultProps} />);
  });
  return unwrap(result);
}

describe('AppShell', () => {
  beforeEach(() => {
    mockPathname = '/dashboard';
    mockSidebarCtx = {
      collapsed: false,
      toggle: vi.fn(),
      setCollapsed: vi.fn(),
      isMobile: false,
      mobileOpen: false,
      setMobileOpen: vi.fn(),
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

  it('renders breadcrumbs instead of h1 title', async () => {
    await renderShell();
    const breadcrumbNav = screen.getByLabelText('Breadcrumb');
    expect(breadcrumbNav).toBeInTheDocument();
  });

  it('renders breadcrumbs with 链接管理 on dashboard root', async () => {
    await renderShell();
    const breadcrumbNav = screen.getByLabelText('Breadcrumb');
    expect(breadcrumbNav.textContent).toContain('链接管理');
  });

  it('renders breadcrumbs with page label on sub-pages', async () => {
    mockPathname = '/dashboard/uploads';
    await renderShell();
    const breadcrumbNav = screen.getByLabelText('Breadcrumb');
    expect(breadcrumbNav).toBeInTheDocument();
    // Breadcrumb should contain the page label and parent link
    expect(breadcrumbNav.textContent).toContain('系统集成');
    expect(breadcrumbNav.textContent).toContain('仪表盘');
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
      mockSidebarCtx.isMobile = false;
      mockSidebarCtx.collapsed = false;
      const { container } = await renderShell();

      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[260px]');
    });

    it('renders collapsed sidebar', async () => {
      mockSidebarCtx.isMobile = false;
      mockSidebarCtx.collapsed = true;
      const { container } = await renderShell();

      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[68px]');
    });

    it('does not show mobile menu button on desktop', async () => {
      mockSidebarCtx.isMobile = false;
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
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = false;
      const { container } = await renderShell();

      const aside = container.querySelector('aside');
      expect(aside).toBeNull();
    });

    it('shows mobile menu button', async () => {
      mockSidebarCtx.isMobile = true;
      const { container } = await renderShell();

      const header = container.querySelector('header');
      const headerButtons = header?.querySelectorAll('button');
      const nonThemeButtons = Array.from(headerButtons || []).filter(
        (btn: Element) => !btn.getAttribute('title')?.includes('Theme')
      );
      expect(nonThemeButtons.length).toBe(1);
    });

    it('calls toggle when mobile menu button is clicked', async () => {
      mockSidebarCtx.isMobile = true;
      const { container } = await renderShell();

      const header = container.querySelector('header');
      const headerButtons = header?.querySelectorAll('button');
      const menuButton = Array.from(headerButtons || []).find(
        (btn: Element) => !btn.getAttribute('title')?.includes('Theme')
      );
      fireEvent.click(unwrap(menuButton));
      expect(mockSidebarCtx.toggle).toHaveBeenCalledOnce();
    });

    it('renders Sheet overlay and sidebar when drawer is open', async () => {
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = true;
      await renderShell();

      // Sheet renders sidebar content via portal — sidebar should be present in document
      // Radix Dialog portal renders outside the container, so query the document body
      const aside = document.querySelector('aside');
      expect(aside).toBeInTheDocument();
    });

    it('renders Sheet overlay when drawer is open', async () => {
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = true;
      await renderShell();

      // Sheet overlay is rendered via Radix portal with role="dialog"
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('folder props passthrough', () => {
    const mockFolders = [
      { id: 'f1', userId: 'u1', name: '工作', icon: 'briefcase', createdAt: new Date('2026-01-01') },
    ];

    it('passes folders to Sidebar in expanded desktop mode', async () => {
      mockSidebarCtx.isMobile = false;
      mockSidebarCtx.collapsed = false;
      mockFoldersVm.folders = mockFolders;
      await renderShell();

      // If folders are passed through, the folder name should appear in sidebar
      expect(screen.getByText('工作')).toBeInTheDocument();
    });

    it('passes folders to Sidebar in collapsed desktop mode', async () => {
      mockSidebarCtx.isMobile = false;
      mockSidebarCtx.collapsed = true;
      mockFoldersVm.folders = mockFolders;
      const { container } = await renderShell();

      // In collapsed mode, all items are links: 1 overview + 2 folder nav + 1 dynamic + 7 static = 11
      const navLinks = container.querySelectorAll('nav a');
      expect(navLinks.length).toBe(11);
    });

    it('passes folders to mobile sidebar when open', async () => {
      mockSidebarCtx.isMobile = true;
      mockSidebarCtx.mobileOpen = true;
      mockFoldersVm.folders = mockFolders;
      await renderShell();

      expect(screen.getByText('工作')).toBeInTheDocument();
    });
  });

  describe('B-2 spec: rounded content area', () => {
    it('uses rounded-[16px] md:rounded-[20px] for content panel', async () => {
      const { container } = await renderShell();

      const contentPanel = container.querySelector('.rounded-\\[16px\\]');
      expect(contentPanel).toBeInTheDocument();
      expect(contentPanel?.className).toContain('md:rounded-[20px]');
    });
  });
});
