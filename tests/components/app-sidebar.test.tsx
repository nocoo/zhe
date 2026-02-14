import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FoldersViewModel } from '@/viewmodels/useFoldersViewModel';

let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

// Mock next/link to a simple anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { AppSidebar } from '@/components/app-sidebar';

function createMockFoldersVm(overrides: Partial<FoldersViewModel> = {}): FoldersViewModel {
  return {
    folders: [],
    selectedFolderId: null,
    editingFolderId: null,
    isCreating: false,
    setIsCreating: vi.fn(),
    selectFolder: vi.fn(),
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

    it('renders folder nav items as buttons and static items as links in collapsed mode', () => {
      const { container } = renderSidebar({ collapsed: true, foldersVm: createMockFoldersVm() });

      // 2 folder nav buttons (全部链接, 未分类) in nav
      const navButtons = container.querySelectorAll('nav button');
      expect(navButtons.length).toBe(2);

      // 1 static link (图床) in nav
      const navLinks = container.querySelectorAll('nav a');
      expect(navLinks.length).toBe(1);
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

    it('displays search placeholder', () => {
      renderSidebar({ collapsed: false });
      expect(screen.getByText('搜索链接...')).toBeInTheDocument();
    });
  });

  describe('folder nav items as buttons', () => {
    it('renders "全部链接" and "未分类" as buttons not links', () => {
      const vm = createMockFoldersVm();
      renderSidebar({ collapsed: false, foldersVm: vm });

      const allLinksBtn = screen.getByText('全部链接').closest('button');
      expect(allLinksBtn).toBeInTheDocument();

      const uncategorizedBtn = screen.getByText('未分类').closest('button');
      expect(uncategorizedBtn).toBeInTheDocument();
    });

    it('calls selectFolder(null) when "全部链接" is clicked', () => {
      const vm = createMockFoldersVm();
      renderSidebar({ collapsed: false, foldersVm: vm });

      const allLinksBtn = screen.getByText('全部链接').closest('button');
      fireEvent.click(allLinksBtn!);
      expect(vm.selectFolder).toHaveBeenCalledWith(null);
    });

    it('calls selectFolder("uncategorized") when "未分类" is clicked', () => {
      const vm = createMockFoldersVm();
      renderSidebar({ collapsed: false, foldersVm: vm });

      const uncategorizedBtn = screen.getByText('未分类').closest('button');
      fireEvent.click(uncategorizedBtn!);
      expect(vm.selectFolder).toHaveBeenCalledWith('uncategorized');
    });

    it('highlights "全部链接" when selectedFolderId is null', () => {
      const vm = createMockFoldersVm({ selectedFolderId: null });
      renderSidebar({ collapsed: false, foldersVm: vm });

      const allLinksBtn = screen.getByText('全部链接').closest('button');
      expect(allLinksBtn?.className).toContain('bg-accent');
      expect(allLinksBtn?.className).toContain('text-foreground');
    });

    it('highlights "未分类" when selectedFolderId is "uncategorized"', () => {
      const vm = createMockFoldersVm({ selectedFolderId: 'uncategorized' });
      renderSidebar({ collapsed: false, foldersVm: vm });

      const uncategorizedBtn = screen.getByText('未分类').closest('button');
      expect(uncategorizedBtn?.className).toContain('bg-accent');
      expect(uncategorizedBtn?.className).toContain('text-foreground');

      const allLinksBtn = screen.getByText('全部链接').closest('button');
      expect(allLinksBtn?.className).toContain('text-muted-foreground');
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

    it('renders folder items as clickable buttons', () => {
      const vm = createMockFoldersVm({ folders: mockFolders });
      renderSidebar({
        collapsed: false,
        foldersVm: vm,
      });

      const workButton = screen.getByText('工作').closest('button');
      expect(workButton).toBeInTheDocument();
      fireEvent.click(workButton!);
      expect(vm.selectFolder).toHaveBeenCalledWith('f1');
    });

    it('highlights selected folder', () => {
      renderSidebar({
        collapsed: false,
        foldersVm: createMockFoldersVm({
          folders: mockFolders,
          selectedFolderId: 'f2',
        }),
      });

      const personalButton = screen.getByText('个人').closest('button');
      expect(personalButton?.className).toContain('bg-accent');
      expect(personalButton?.className).toContain('text-foreground');

      const workButton = screen.getByText('工作').closest('button');
      expect(workButton?.className).toContain('text-muted-foreground');
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

    it('shows folder icons in collapsed mode as tooltip buttons', () => {
      const { container } = renderSidebar({
        collapsed: true,
        foldersVm: createMockFoldersVm({ folders: mockFolders }),
      });

      // Buttons: 2 folder nav items (全部链接, 未分类) + 2 dynamic folders = 4
      // Links: 1 static (图床)
      const navButtons = container.querySelectorAll('nav button');
      const navLinks = container.querySelectorAll('nav a');
      expect(navButtons.length).toBe(4);
      expect(navLinks.length).toBe(1);
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
