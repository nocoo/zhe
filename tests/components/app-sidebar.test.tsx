import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FoldersViewModel } from '@/viewmodels/useFoldersViewModel';

let mockPathname = '/dashboard';
let mockSearchParamsFolder: string | null = null;

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => key === 'folder' ? mockSearchParamsFolder : null,
  }),
}));

// Mock next/link to a simple anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock actions to prevent next-auth/next-server import chain
vi.mock('@/actions/links', () => ({
  getLinks: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock('@/actions/folders', () => ({
  getFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

// Mock DashboardService context — mutable links array for count badge tests
import type { Link } from '@/models/types';

let mockLinks: Link[] = [];

vi.mock('@/contexts/dashboard-service', () => ({
  useDashboardService: () => ({
    get links() { return mockLinks; },
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
}));

// Mock useFoldersViewModel — mutable so each test can configure it
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

import { AppSidebar } from '@/components/app-sidebar';

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 1,
    userId: 'user-1',
    folderId: null,
    originalUrl: 'https://example.com',
    slug: 'abc123',
    isCustom: false,
    expiresAt: null,
    clicks: 0,
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
    screenshotUrl: null,
    note: null,
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function resetMockFoldersVm(overrides: Partial<FoldersViewModel> = {}): void {
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
    ...overrides,
  };
}

function renderSidebar(props: Partial<Parameters<typeof AppSidebar>[0]> = {}) {
  const defaultProps = {
    collapsed: false,
    onToggle: vi.fn(),
    user: { name: 'Test User', email: 'test@example.com', image: null },
    signOutAction: vi.fn(async () => {}),
    ...props,
  };
  return render(
    <TooltipProvider>
      <AppSidebar {...defaultProps} />
    </TooltipProvider>
  );
}

describe('AppSidebar', () => {
  beforeEach(() => {
    mockPathname = '/dashboard';
    mockSearchParamsFolder = null;
    mockLinks = [];
    resetMockFoldersVm();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('collapsed mode', () => {
    it('renders narrow sidebar with icon-only navigation', () => {
      const { container } = renderSidebar({ collapsed: true });

      // Should render the narrow aside (68px)
      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[68px]');

      // "全部链接" and "Inbox" should not be visible as text
      expect(screen.queryByText('全部链接')).not.toBeInTheDocument();
      expect(screen.queryByText('Inbox')).not.toBeInTheDocument();
    });

    it('renders all nav items as links in collapsed mode', () => {
      const { container } = renderSidebar({ collapsed: true });

      // All items (1 overview + 2 folder nav + 2 static) are now <Link> (rendered as <a>)
      const navLinks = container.querySelectorAll('nav a');
      expect(navLinks.length).toBe(5);
    });

    it('does not show version badge in collapsed mode', () => {
      renderSidebar({ collapsed: true });
      expect(screen.queryByText(/^v\d+\.\d+\.\d+$/)).not.toBeInTheDocument();
    });
  });

  describe('expanded mode', () => {
    it('renders wide sidebar with text navigation', () => {
      const { container } = renderSidebar({ collapsed: false });

      // Should render the wide aside (260px)
      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[260px]');

      // Should display nav item text labels
      expect(screen.getByText('全部链接')).toBeInTheDocument();
      expect(screen.getByText('Inbox')).toBeInTheDocument();
    });

    it('displays brand name ZHE.TO', () => {
      renderSidebar({ collapsed: false });
      expect(screen.getByText('ZHE.TO')).toBeInTheDocument();
    });

    it('displays version badge next to brand name', () => {
      renderSidebar({ collapsed: false });
      expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
    });

    it('displays search button with text', () => {
      renderSidebar({ collapsed: false });
      expect(screen.getByText('搜索链接...')).toBeInTheDocument();
    });

    it('displays ⌘K keyboard shortcut hint in search button', () => {
      renderSidebar({ collapsed: false });
      expect(screen.getByText('K')).toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    it('opens search dialog when search button is clicked', () => {
      renderSidebar({ collapsed: false });

      const searchButton = screen.getByText('搜索链接...').closest('button');
      expect(searchButton).toBeInTheDocument();
      fireEvent.click(searchButton!);

      // SearchCommandDialog should render with a search input
      expect(screen.getByPlaceholderText('搜索链接、标题、备注、标签...')).toBeInTheDocument();
    });

    it('opens search dialog on Cmd+K', () => {
      renderSidebar({ collapsed: false });

      fireEvent.keyDown(document, { key: 'k', metaKey: true });

      expect(screen.getByPlaceholderText('搜索链接、标题、备注、标签...')).toBeInTheDocument();
    });

    it('opens search dialog on Ctrl+K', () => {
      renderSidebar({ collapsed: false });

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

      expect(screen.getByPlaceholderText('搜索链接、标题、备注、标签...')).toBeInTheDocument();
    });

    it('toggles search dialog closed on second Cmd+K', () => {
      renderSidebar({ collapsed: false });

      // Open
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      expect(screen.getByPlaceholderText('搜索链接、标题、备注、标签...')).toBeInTheDocument();

      // Close — the CommandInput placeholder should disappear
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      expect(screen.queryByPlaceholderText('搜索链接、标题、备注、标签...')).not.toBeInTheDocument();
    });

    it('does not open search dialog on plain K key', () => {
      renderSidebar({ collapsed: false });

      fireEvent.keyDown(document, { key: 'k' });

      // The sidebar button text "搜索链接..." exists, but no CommandInput placeholder
      const allMatches = screen.queryAllByPlaceholderText('搜索链接、标题、备注、标签...');
      expect(allMatches).toHaveLength(0);
    });

    it('does not render search button in collapsed mode', () => {
      renderSidebar({ collapsed: true });

      expect(screen.queryByText('搜索链接...')).not.toBeInTheDocument();
    });

    it('opens search dialog on Cmd+K even when sidebar is collapsed', () => {
      renderSidebar({ collapsed: true });

      fireEvent.keyDown(document, { key: 'k', metaKey: true });

      expect(screen.getByPlaceholderText('搜索链接、标题、备注、标签...')).toBeInTheDocument();
    });

    it('prevents default browser behavior on Cmd+K', () => {
      renderSidebar({ collapsed: false });

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('overview nav item', () => {
    it('renders "概览" link in expanded mode', () => {
      renderSidebar({ collapsed: false });

      // Find the link by href (the section label "概览" also exists as text)
      const overviewLink = screen.getByRole('link', { name: '概览' });
      expect(overviewLink).toBeInTheDocument();
      expect(overviewLink.getAttribute('href')).toBe('/dashboard/overview');
    });

    it('highlights "概览" when on overview page', () => {
      mockPathname = '/dashboard/overview';
      renderSidebar({ collapsed: false });

      const overviewLink = screen.getByRole('link', { name: '概览' });
      expect(overviewLink.className).toContain('bg-accent');
      expect(overviewLink.className).toContain('text-foreground');
    });

    it('renders overview section label above 链接管理', () => {
      const { container } = renderSidebar({ collapsed: false });

      // Find section labels by their class
      const sectionLabels = container.querySelectorAll('.text-sm.font-normal.text-muted-foreground');
      const labels = Array.from(sectionLabels).map((el) => el.textContent);

      // Overview should come before 链接管理
      const overviewIndex = labels.indexOf('概览');
      const linksIndex = labels.indexOf('链接管理');
      expect(overviewIndex).toBeLessThan(linksIndex);
    });
  });

  describe('folder nav items as links', () => {
    it('renders "全部链接" and "Inbox" as links not buttons', () => {
      renderSidebar({ collapsed: false });

      const allLinksAnchor = screen.getByText('全部链接').closest('a');
      expect(allLinksAnchor).toBeInTheDocument();
      expect(allLinksAnchor?.getAttribute('href')).toBe('/dashboard');

      const uncategorizedAnchor = screen.getByText('Inbox').closest('a');
      expect(uncategorizedAnchor).toBeInTheDocument();
      expect(uncategorizedAnchor?.getAttribute('href')).toBe('/dashboard?folder=uncategorized');
    });

    it('highlights "全部链接" when no folder param in URL', () => {
      mockSearchParamsFolder = null;
      renderSidebar({ collapsed: false });

      const allLinksAnchor = screen.getByText('全部链接').closest('a');
      expect(allLinksAnchor?.className).toContain('bg-accent');
      expect(allLinksAnchor?.className).toContain('text-foreground');
    });

    it('highlights "Inbox" when folder=uncategorized in URL', () => {
      mockSearchParamsFolder = 'uncategorized';
      renderSidebar({ collapsed: false });

      const uncategorizedAnchor = screen.getByText('Inbox').closest('a');
      expect(uncategorizedAnchor?.className).toContain('bg-accent');
      expect(uncategorizedAnchor?.className).toContain('text-foreground');

      const allLinksAnchor = screen.getByText('全部链接').closest('a');
      expect(allLinksAnchor?.className).toContain('text-muted-foreground');
    });
  });

  describe('user avatar', () => {
    it('shows fallback initial when no image is provided', () => {
      renderSidebar({
        collapsed: false,
        user: { name: 'Test User', email: 'test@example.com', image: null },
      });

      // AvatarFallback renders the first character of the name
      expect(screen.getByText('T')).toBeInTheDocument();
    });

    it('shows "U" fallback when user has no name and no image', () => {
      renderSidebar({
        collapsed: false,
        user: { name: null, email: 'test@example.com', image: null },
      });

      expect(screen.getByText('U')).toBeInTheDocument();
    });

    it('displays user name and email in expanded mode', () => {
      renderSidebar({
        collapsed: false,
        user: { name: 'Alice', email: 'alice@example.com', image: null },
      });

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });
  });

  describe('sign out button', () => {
    it('renders a sign out submit button in expanded mode', () => {
      const { container } = renderSidebar({ collapsed: false });

      const submitButton = container.querySelector('form button[type="submit"]');
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('toggle button', () => {
    it('calls onToggle when toggle button is clicked', () => {
      const onToggle = vi.fn();
      const { container } = renderSidebar({ collapsed: false, onToggle });

      // The toggle button contains the PanelLeft icon and is in the header area
      const buttons = container.querySelectorAll('button');
      // First button in header area is the toggle (not the submit button)
      const toggleButton = Array.from(buttons).find((btn) =>
        !btn.getAttribute('type') || btn.getAttribute('type') !== 'submit'
      );
      fireEvent.click(toggleButton!);
      expect(onToggle).toHaveBeenCalledOnce();
    });
  });

  describe('folders in sidebar', () => {
    const mockFolders = [
      { id: 'f1', userId: 'u1', name: '工作', icon: 'briefcase', createdAt: new Date('2026-01-01') },
      { id: 'f2', userId: 'u1', name: '个人', icon: 'heart', createdAt: new Date('2026-01-02') },
    ];

    it('renders folder items in expanded mode', () => {
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      expect(screen.getByText('工作')).toBeInTheDocument();
      expect(screen.getByText('个人')).toBeInTheDocument();
    });

    it('renders folder items as links with correct href', () => {
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      const workLink = screen.getByText('工作').closest('a');
      expect(workLink).toBeInTheDocument();
      expect(workLink?.getAttribute('href')).toBe('/dashboard?folder=f1');
    });

    it('highlights selected folder based on URL param', () => {
      mockSearchParamsFolder = 'f2';
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      const personalLink = screen.getByText('个人').closest('a');
      expect(personalLink?.className).toContain('bg-accent');
      expect(personalLink?.className).toContain('text-foreground');

      const workLink = screen.getByText('工作').closest('a');
      expect(workLink?.className).toContain('text-muted-foreground');
    });

    it('renders no folder items when folders is empty', () => {
      resetMockFoldersVm({ folders: [] });
      renderSidebar({ collapsed: false });

      // Static items still exist
      expect(screen.getByText('全部链接')).toBeInTheDocument();
      expect(screen.getByText('Inbox')).toBeInTheDocument();
    });

    it('shows folder icons in collapsed mode as tooltip links', () => {
      resetMockFoldersVm({ folders: mockFolders });
      const { container } = renderSidebar({ collapsed: true });

      // All items are links: 1 overview + 2 folder nav + 2 dynamic folders + 2 static = 7
      const navLinks = container.querySelectorAll('nav a');
      expect(navLinks.length).toBe(7);
    });

    it('renders "新建文件夹" button in expanded mode', () => {
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      expect(screen.getByLabelText('新建文件夹')).toBeInTheDocument();
    });

    it('calls setIsCreating(true) when "新建文件夹" button is clicked', () => {
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      fireEvent.click(screen.getByLabelText('新建文件夹'));
      expect(mockFoldersVm.setIsCreating).toHaveBeenCalledWith(true);
    });

    it('renders SidebarFolderItem with context menu trigger for each folder', () => {
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      // Each SidebarFolderItem in normal mode has a "文件夹操作" menu trigger
      const menuTriggers = screen.getAllByLabelText('文件夹操作');
      expect(menuTriggers).toHaveLength(2);
    });

    it('shows edit form for the folder being edited', () => {
      resetMockFoldersVm({
        folders: mockFolders,
        editingFolderId: 'f1',
      });
      renderSidebar({ collapsed: false });

      // The editing folder should show an input with its name
      expect(screen.getByDisplayValue('工作')).toBeInTheDocument();
      expect(screen.getByLabelText('确认')).toBeInTheDocument();
      expect(screen.getByLabelText('取消')).toBeInTheDocument();

      // The non-editing folder should still show normally
      expect(screen.getByText('个人')).toBeInTheDocument();
    });

    it('shows create form when isCreating is true', () => {
      resetMockFoldersVm({
        folders: mockFolders,
        isCreating: true,
      });
      renderSidebar({ collapsed: false });

      // SidebarFolderCreate renders an empty input with placeholder
      expect(screen.getByPlaceholderText('文件夹名称')).toBeInTheDocument();
    });

    it('does not show create form when isCreating is false', () => {
      resetMockFoldersVm({
        folders: mockFolders,
        isCreating: false,
      });
      renderSidebar({ collapsed: false });

      expect(screen.queryByPlaceholderText('文件夹名称')).not.toBeInTheDocument();
    });

    it('wires handleCreateFolder to SidebarFolderCreate onCreate', () => {
      resetMockFoldersVm({
        folders: mockFolders,
        isCreating: true,
      });
      renderSidebar({ collapsed: false });

      const input = screen.getByPlaceholderText('文件夹名称');
      fireEvent.change(input, { target: { value: '新文件夹' } });
      fireEvent.click(screen.getByLabelText('确认'));

      expect(mockFoldersVm.handleCreateFolder).toHaveBeenCalledWith('新文件夹', 'folder');
    });

    it('wires setIsCreating(false) to SidebarFolderCreate onCancel', () => {
      resetMockFoldersVm({
        folders: mockFolders,
        isCreating: true,
      });
      renderSidebar({ collapsed: false });

      fireEvent.click(screen.getByLabelText('取消'));
      expect(mockFoldersVm.setIsCreating).toHaveBeenCalledWith(false);
    });
  });

  describe('system nav group', () => {
    it('renders "系统" section label in expanded mode', () => {
      renderSidebar({ collapsed: false });

      expect(screen.getByText('系统')).toBeInTheDocument();
    });

    it('renders "设置" link in expanded mode', () => {
      renderSidebar({ collapsed: false });

      const settingsLink = screen.getByRole('link', { name: '设置' });
      expect(settingsLink).toBeInTheDocument();
      expect(settingsLink.getAttribute('href')).toBe('/dashboard/settings');
    });

    it('highlights "设置" when on settings page', () => {
      mockPathname = '/dashboard/settings';
      renderSidebar({ collapsed: false });

      const settingsLink = screen.getByRole('link', { name: '设置' });
      expect(settingsLink.className).toContain('bg-accent');
      expect(settingsLink.className).toContain('text-foreground');
    });

    it('renders "系统" section below 文件管理 section', () => {
      const { container } = renderSidebar({ collapsed: false });

      const sectionLabels = container.querySelectorAll('.text-sm.font-normal.text-muted-foreground');
      const labels = Array.from(sectionLabels).map((el) => el.textContent);

      const uploadsIndex = labels.indexOf('文件管理');
      const systemIndex = labels.indexOf('系统');
      expect(uploadsIndex).toBeGreaterThanOrEqual(0);
      expect(systemIndex).toBeGreaterThan(uploadsIndex);
    });

    it('renders settings link in collapsed mode', () => {
      const { container } = renderSidebar({ collapsed: true });

      // Should include settings link: 1 overview + 2 folder nav + 1 uploads + 1 settings = 5
      const navLinks = container.querySelectorAll('nav a');
      expect(navLinks.length).toBe(5);
    });
  });

  describe('link count badges', () => {
    const mockFolders = [
      { id: 'f1', userId: 'u1', name: '工作', icon: 'briefcase', createdAt: new Date('2026-01-01') },
      { id: 'f2', userId: 'u1', name: '个人', icon: 'heart', createdAt: new Date('2026-01-02') },
    ];

    it('shows total link count next to "全部链接"', () => {
      mockLinks = [
        makeLink({ id: 1, folderId: null }),
        makeLink({ id: 2, folderId: 'f1' }),
        makeLink({ id: 3, folderId: 'f2' }),
      ];
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      const allLinksItem = screen.getByText('全部链接').closest('a')!;
      expect(allLinksItem.textContent).toContain('3');
    });

    it('shows uncategorized link count next to "Inbox"', () => {
      mockLinks = [
        makeLink({ id: 1, folderId: null }),
        makeLink({ id: 2, folderId: null }),
        makeLink({ id: 3, folderId: 'f1' }),
      ];
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      const uncategorizedItem = screen.getByText('Inbox').closest('a')!;
      expect(uncategorizedItem.textContent).toContain('2');
    });

    it('shows per-folder link count next to folder name', () => {
      mockLinks = [
        makeLink({ id: 1, folderId: 'f1' }),
        makeLink({ id: 2, folderId: 'f1' }),
        makeLink({ id: 3, folderId: 'f1' }),
        makeLink({ id: 4, folderId: 'f2' }),
      ];
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      // SidebarFolderItem for '工作' should display count 3
      const workItem = screen.getByText('工作').closest('a')!;
      expect(workItem.textContent).toContain('3');

      // SidebarFolderItem for '个人' should display count 1
      const personalItem = screen.getByText('个人').closest('a')!;
      expect(personalItem.textContent).toContain('1');
    });

    it('shows 0 count for folder with no links', () => {
      mockLinks = [
        makeLink({ id: 1, folderId: 'f1' }),
      ];
      resetMockFoldersVm({ folders: mockFolders });
      renderSidebar({ collapsed: false });

      // '个人' (f2) has no links, should show 0
      const personalItem = screen.getByText('个人').closest('a')!;
      expect(personalItem.textContent).toContain('0');
    });

    it('wraps "全部链接" and "Inbox" counts in a fixed-width w-5 container', () => {
      mockLinks = [
        makeLink({ id: 1, folderId: null }),
        makeLink({ id: 2, folderId: null }),
      ];
      resetMockFoldersVm({ folders: [] });
      renderSidebar({ collapsed: false });

      const allLinksItem = screen.getByText('全部链接').closest('a')!;
      const allCount = allLinksItem.querySelector('.tabular-nums')!;
      const allContainer = allCount.parentElement!;
      expect(allContainer.className).toContain('w-5');
      expect(allContainer.className).toContain('shrink-0');

      const uncategorizedItem = screen.getByText('Inbox').closest('a')!;
      const uncatCount = uncategorizedItem.querySelector('.tabular-nums')!;
      const uncatContainer = uncatCount.parentElement!;
      expect(uncatContainer.className).toContain('w-5');
      expect(uncatContainer.className).toContain('shrink-0');
    });

    it('does not show count badges in collapsed mode', () => {
      mockLinks = [
        makeLink({ id: 1, folderId: null }),
        makeLink({ id: 2, folderId: 'f1' }),
      ];
      resetMockFoldersVm({ folders: mockFolders });
      const { container } = renderSidebar({ collapsed: true });

      // Collapsed mode should not have any count text (just icons)
      // The nav should only contain icon links, no text counts
      const navText = container.querySelector('nav')?.textContent ?? '';
      expect(navText.trim()).toBe('');
    });
  });
});
