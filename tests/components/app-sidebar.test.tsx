import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FoldersViewModel } from '@/viewmodels/useFoldersViewModel';

let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
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
      const { container } = renderSidebar({ collapsed: true });

      // Should render the narrow aside (68px)
      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside?.className).toContain('w-[68px]');

      // Should have nav links but no visible text labels
      const links = container.querySelectorAll('nav a');
      expect(links.length).toBe(3);

      // Text labels should not be visible (no span with item titles)
      expect(screen.queryByText('全部链接')).not.toBeInTheDocument();
      expect(screen.queryByText('未分类')).not.toBeInTheDocument();
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

  describe('active nav item', () => {
    it('highlights the active nav item matching pathname', () => {
      mockPathname = '/dashboard';
      const { container } = renderSidebar({ collapsed: false });

      const links = container.querySelectorAll('nav a');
      const dashboardLink = Array.from(links).find(
        (a) => a.getAttribute('href') === '/dashboard'
      );
      expect(dashboardLink?.className).toContain('bg-accent');
      expect(dashboardLink?.className).toContain('text-foreground');
    });

    it('does not highlight non-active nav items', () => {
      mockPathname = '/dashboard';
      const { container } = renderSidebar({ collapsed: false });

      const links = container.querySelectorAll('nav a');
      const uncategorizedLink = Array.from(links).find(
        (a) => a.getAttribute('href') === '/dashboard?folder=uncategorized'
      );
      // The non-active item should have hover styles, not the active bg-accent + text-foreground combo
      expect(uncategorizedLink?.className).toContain('text-muted-foreground');
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

      // Static items still exist, no crash
      expect(screen.getByText('全部链接')).toBeInTheDocument();
    });

    it('shows folder icons in collapsed mode as tooltip buttons', () => {
      const { container } = renderSidebar({
        collapsed: true,
        foldersVm: createMockFoldersVm({ folders: mockFolders }),
      });

      // Should have static items (3) + folder items (2) = 5 nav items
      // In collapsed mode, static items are links, folder items are buttons
      const navLinks = container.querySelectorAll('nav a');
      const navButtons = container.querySelectorAll('nav button');
      expect(navLinks.length).toBe(3);
      expect(navButtons.length).toBe(2);
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
  });
});
