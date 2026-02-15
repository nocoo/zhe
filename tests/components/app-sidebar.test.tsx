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

// Mock DashboardService context for SearchCommandDialog
vi.mock('@/contexts/dashboard-service', () => ({
  useDashboardService: () => ({
    links: [],
    folders: [],
    loading: false,
    siteUrl: 'https://zhe.to',
    handleLinkCreated: vi.fn(),
    handleLinkDeleted: vi.fn(),
    handleLinkUpdated: vi.fn(),
    handleFolderCreated: vi.fn(),
    handleFolderDeleted: vi.fn(),
    handleFolderUpdated: vi.fn(),
  }),
}));

import { AppSidebar } from '@/components/app-sidebar';

function createMockFoldersVm(overrides: Partial<FoldersViewModel> = {}): FoldersViewModel {
  return {
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
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('collapsed mode', () => {
    it('renders narrow sidebar with icon-only navigation', () => {
      const { container } = renderSidebar({ collapsed: true, foldersVm: createMockFoldersVm() });

      // Should render the narrow aside (68px)
      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[68px]');

      // "全部链接" and "未分类" should not be visible as text
      expect(screen.queryByText('全部链接')).not.toBeInTheDocument();
      expect(screen.queryByText('未分类')).not.toBeInTheDocument();
    });

    it('renders all nav items as links in collapsed mode', () => {
      const { container } = renderSidebar({ collapsed: true, foldersVm: createMockFoldersVm() });

      // All items (2 folder nav + 1 static) are now <Link> (rendered as <a>)
      const navLinks = container.querySelectorAll('nav a');
      expect(navLinks.length).toBe(3);
    });
  });

  describe('expanded mode', () => {
    it('renders wide sidebar with text navigation', () => {
      const { container } = renderSidebar({ collapsed: false, foldersVm: createMockFoldersVm() });

      // Should render the wide aside (260px)
      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[260px]');

      // Should display nav item text labels
      expect(screen.getByText('全部链接')).toBeInTheDocument();
      expect(screen.getByText('未分类')).toBeInTheDocument();
    });

    it('displays brand name ZHE.TO', () => {
      renderSidebar({ collapsed: false });
      expect(screen.getByText('ZHE.TO')).toBeInTheDocument();
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
      expect(screen.getByPlaceholderText('搜索链接...')).toBeInTheDocument();
    });

    it('opens search dialog on Cmd+K', () => {
      renderSidebar({ collapsed: false });

      fireEvent.keyDown(document, { key: 'k', metaKey: true });

      expect(screen.getByPlaceholderText('搜索链接...')).toBeInTheDocument();
    });

    it('opens search dialog on Ctrl+K', () => {
      renderSidebar({ collapsed: false });

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

      expect(screen.getByPlaceholderText('搜索链接...')).toBeInTheDocument();
    });

    it('toggles search dialog closed on second Cmd+K', () => {
      renderSidebar({ collapsed: false });

      // Open
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      expect(screen.getByPlaceholderText('搜索链接...')).toBeInTheDocument();

      // Close — the CommandInput placeholder should disappear
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      expect(screen.queryByPlaceholderText('搜索链接...')).not.toBeInTheDocument();
    });

    it('does not open search dialog on plain K key', () => {
      renderSidebar({ collapsed: false });

      fireEvent.keyDown(document, { key: 'k' });

      // The sidebar button text "搜索链接..." exists, but no CommandInput placeholder
      const allMatches = screen.queryAllByPlaceholderText('搜索链接...');
      expect(allMatches).toHaveLength(0);
    });
  });

  describe('folder nav items as links', () => {
    it('renders "全部链接" and "未分类" as links not buttons', () => {
      const vm = createMockFoldersVm();
      renderSidebar({ collapsed: false, foldersVm: vm });

      const allLinksAnchor = screen.getByText('全部链接').closest('a');
      expect(allLinksAnchor).toBeInTheDocument();
      expect(allLinksAnchor?.getAttribute('href')).toBe('/dashboard');

      const uncategorizedAnchor = screen.getByText('未分类').closest('a');
      expect(uncategorizedAnchor).toBeInTheDocument();
      expect(uncategorizedAnchor?.getAttribute('href')).toBe('/dashboard?folder=uncategorized');
    });

    it('highlights "全部链接" when no folder param in URL', () => {
      mockSearchParamsFolder = null;
      const vm = createMockFoldersVm();
      renderSidebar({ collapsed: false, foldersVm: vm });

      const allLinksAnchor = screen.getByText('全部链接').closest('a');
      expect(allLinksAnchor?.className).toContain('bg-accent');
      expect(allLinksAnchor?.className).toContain('text-foreground');
    });

    it('highlights "未分类" when folder=uncategorized in URL', () => {
      mockSearchParamsFolder = 'uncategorized';
      const vm = createMockFoldersVm();
      renderSidebar({ collapsed: false, foldersVm: vm });

      const uncategorizedAnchor = screen.getByText('未分类').closest('a');
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
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({ folders: mockFolders }),
      });

      expect(screen.getByText('工作')).toBeInTheDocument();
      expect(screen.getByText('个人')).toBeInTheDocument();
    });

    it('renders folder items as links with correct href', () => {
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({ folders: mockFolders }),
      });

      const workLink = screen.getByText('工作').closest('a');
      expect(workLink).toBeInTheDocument();
      expect(workLink?.getAttribute('href')).toBe('/dashboard?folder=f1');
    });

    it('highlights selected folder based on URL param', () => {
      mockSearchParamsFolder = 'f2';
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({ folders: mockFolders }),
      });

      const personalLink = screen.getByText('个人').closest('a');
      expect(personalLink?.className).toContain('bg-accent');
      expect(personalLink?.className).toContain('text-foreground');

      const workLink = screen.getByText('工作').closest('a');
      expect(workLink?.className).toContain('text-muted-foreground');
    });

    it('renders no folder items when folders is empty', () => {
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({ folders: [] }),
      });

      // Static items still exist
      expect(screen.getByText('全部链接')).toBeInTheDocument();
      expect(screen.getByText('未分类')).toBeInTheDocument();
    });

    it('renders no folder items when foldersVm is not provided', () => {
      renderSidebar({ collapsed: false });

      // Should not crash even without foldersVm
      expect(screen.queryByText('全部链接')).toBeInTheDocument();
    });

    it('shows folder icons in collapsed mode as tooltip links', () => {
      const { container } = renderSidebar({
        collapsed: true,
        foldersVm: createMockFoldersVm({ folders: mockFolders }),
      });

      // All items are links: 2 folder nav + 2 dynamic folders + 1 static = 5
      const navLinks = container.querySelectorAll('nav a');
      expect(navLinks.length).toBe(5);
    });

    it('renders "新建文件夹" button in expanded mode when foldersVm provided', () => {
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({ folders: mockFolders }),
      });

      expect(screen.getByLabelText('新建文件夹')).toBeInTheDocument();
    });

    it('calls setIsCreating(true) when "新建文件夹" button is clicked', () => {
      const vm = createMockFoldersVm({ folders: mockFolders });
      renderSidebar({
        collapsed: false,
        foldersVm: vm,
      });

      fireEvent.click(screen.getByLabelText('新建文件夹'));
      expect(vm.setIsCreating).toHaveBeenCalledWith(true);
    });

    it('renders SidebarFolderItem with context menu trigger for each folder', () => {
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({ folders: mockFolders }),
      });

      // Each SidebarFolderItem in normal mode has a "文件夹操作" menu trigger
      const menuTriggers = screen.getAllByLabelText('文件夹操作');
      expect(menuTriggers).toHaveLength(2);
    });

    it('shows edit form for the folder being edited', () => {
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({
          folders: mockFolders,
          editingFolderId: 'f1',
        }),
      });

      // The editing folder should show an input with its name
      expect(screen.getByDisplayValue('工作')).toBeInTheDocument();
      expect(screen.getByLabelText('确认')).toBeInTheDocument();
      expect(screen.getByLabelText('取消')).toBeInTheDocument();

      // The non-editing folder should still show normally
      expect(screen.getByText('个人')).toBeInTheDocument();
    });

    it('shows create form when isCreating is true', () => {
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({
          folders: mockFolders,
          isCreating: true,
        }),
      });

      // SidebarFolderCreate renders an empty input with placeholder
      expect(screen.getByPlaceholderText('文件夹名称')).toBeInTheDocument();
    });

    it('does not show create form when isCreating is false', () => {
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({
          folders: mockFolders,
          isCreating: false,
        }),
      });

      expect(screen.queryByPlaceholderText('文件夹名称')).not.toBeInTheDocument();
    });

    it('wires handleCreateFolder to SidebarFolderCreate onCreate', () => {
      const vm = createMockFoldersVm({
        folders: mockFolders,
        isCreating: true,
      });
      renderSidebar({ collapsed: false, foldersVm: vm });

      const input = screen.getByPlaceholderText('文件夹名称');
      fireEvent.change(input, { target: { value: '新文件夹' } });
      fireEvent.click(screen.getByLabelText('确认'));

      expect(vm.handleCreateFolder).toHaveBeenCalledWith('新文件夹', 'folder');
    });

    it('wires setIsCreating(false) to SidebarFolderCreate onCancel', () => {
      const vm = createMockFoldersVm({
        folders: mockFolders,
        isCreating: true,
      });
      renderSidebar({ collapsed: false, foldersVm: vm });

      fireEvent.click(screen.getByLabelText('取消'));
      expect(vm.setIsCreating).toHaveBeenCalledWith(false);
    });
  });
});
