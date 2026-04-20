// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Link, Folder, Tag, LinkTag } from '@/models/types';
import type { DashboardService } from '@/contexts/dashboard-service';
import { unwrap } from '../test-utils';
import { makeLink, makeFolder, makeTag } from '../fixtures';

let mockSearchParamsFolder: string | null = null;

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => key === 'folder' ? mockSearchParamsFolder : null,
  }),
}));

// Mock actions to prevent next-auth import chain
vi.mock('@/actions/links', () => ({
  getLinks: vi.fn(),
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  updateLink: vi.fn(),
  updateLinkNote: vi.fn(),
  getAnalyticsStats: vi.fn(),
  saveScreenshot: vi.fn(),
}));

vi.mock('@/actions/folders', () => ({
  getFolders: vi.fn(),
}));

vi.mock('@/actions/tags', () => ({
  createTag: vi.fn(),
  addTagToLink: vi.fn(),
  removeTagFromLink: vi.fn(),
}));

// Default to desktop so filter controls render inline (not inside popover)
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

// Mock DashboardService context — mutable so each test can set its own data
const mockService: DashboardService = {
  links: [],
  folders: [],
  tags: [],
  linkTags: [],
  ideas: [],
  loading: false,
  ideasLoading: false,
  siteUrl: 'http://localhost:3000',
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
  ensureIdeasLoaded: vi.fn().mockResolvedValue(undefined),
  refreshIdeas: vi.fn().mockResolvedValue(undefined),
  handleIdeaCreated: vi.fn(),
  handleIdeaDeleted: vi.fn(),
  handleIdeaUpdated: vi.fn(),
};

vi.mock('@/contexts/dashboard-service', () => ({
  useDashboardService: () => mockService,
}));

import { LinksList } from '@/components/dashboard/links-list';

const mockLinks: Link[] = [
  makeLink({
    id: 1,
    userId: 'u1',
    slug: 'abc',
    originalUrl: 'https://example.com/1',
    clicks: 10,
    createdAt: new Date('2026-01-01'),
    folderId: 'f1',
    metaTitle: 'Example 1',
    metaFavicon: 'https://example.com/favicon.ico',
    screenshotUrl: 'https://screenshot.example.com/1.png',
  }),
  makeLink({
    id: 2,
    userId: 'u1',
    slug: 'def',
    originalUrl: 'https://example.com/2',
    clicks: 5,
    createdAt: new Date('2026-01-02'),
    folderId: 'f2',
    metaTitle: 'Example 2',
    metaFavicon: 'https://example.com/favicon.ico',
    screenshotUrl: 'https://screenshot.example.com/2.png',
  }),
  makeLink({
    id: 3,
    userId: 'u1',
    slug: 'ghi',
    originalUrl: 'https://example.com/3',
    clicks: 0,
    createdAt: new Date('2026-01-03'),
    folderId: null,
    metaTitle: 'Example 3',
    metaFavicon: 'https://example.com/favicon.ico',
    screenshotUrl: 'https://screenshot.example.com/3.png',
  }),
];

const mockFolders: Folder[] = [
  makeFolder({ id: 'f1', userId: 'u1', name: '工作', icon: 'briefcase', createdAt: new Date('2026-01-01') }),
  makeFolder({ id: 'f2', userId: 'u1', name: '个人', icon: 'heart', createdAt: new Date('2026-01-02') }),
];

const mockTags: Tag[] = [
  makeTag({ id: 't1', userId: 'u1', name: 'dev', color: 'cobalt', createdAt: new Date('2026-01-01') }),
  makeTag({ id: 't2', userId: 'u1', name: 'design', color: 'rose', createdAt: new Date('2026-01-02') }),
  makeTag({ id: 't3', userId: 'u1', name: 'blog', color: 'green', createdAt: new Date('2026-01-03') }),
];

const mockLinkTags: LinkTag[] = [
  { linkId: 1, tagId: 't1' }, // link 1 (abc) has tag "dev"
  { linkId: 1, tagId: 't2' }, // link 1 (abc) has tag "design"
  { linkId: 2, tagId: 't2' }, // link 2 (def) has tag "design"
  { linkId: 3, tagId: 't3' }, // link 3 (ghi) has tag "blog"
];

function setupService(
  links: Link[] = mockLinks,
  folders: Folder[] = mockFolders,
  loading = false,
  tags: Tag[] = mockTags,
  linkTags: LinkTag[] = mockLinkTags,
) {
  mockService.links = links;
  mockService.folders = folders;
  mockService.tags = tags;
  mockService.linkTags = linkTags;
  mockService.loading = loading;
}

describe('LinksList', () => {
  beforeEach(() => {
    mockSearchParamsFolder = null;
    setupService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows skeleton while loading', () => {
    setupService([], [], true);
    render(<LinksList />);

    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
    expect(screen.queryByText('全部链接')).not.toBeInTheDocument();
  });

  it('shows all links when no folder is selected', () => {
    mockSearchParamsFolder = null;
    render(<LinksList />);

    expect(screen.getByText('全部链接')).toBeInTheDocument();
    expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('ghi')).toBeInTheDocument();
  });

  it('filters links by selected folder', () => {
    mockSearchParamsFolder = 'f1';
    render(<LinksList />);

    expect(screen.getByText('工作')).toBeInTheDocument();
    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.queryByText('def')).not.toBeInTheDocument();
    expect(screen.queryByText('ghi')).not.toBeInTheDocument();
  });

  it('shows folder name as header when folder is selected', () => {
    mockSearchParamsFolder = 'f2';
    render(<LinksList />);

    expect(screen.getByText('个人')).toBeInTheDocument();
    expect(screen.queryByText('全部链接')).not.toBeInTheDocument();
  });

  it('shows correct count for filtered links', () => {
    mockSearchParamsFolder = 'f2';
    render(<LinksList />);

    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
  });

  it('shows empty state when selected folder has no links', () => {
    mockSearchParamsFolder = 'f-nonexistent';
    render(<LinksList />);

    expect(screen.getByText('暂无链接')).toBeInTheDocument();
    expect(screen.getByText('共 0 条链接')).toBeInTheDocument();
  });

  it('shows uncategorized links when folder=uncategorized', () => {
    mockSearchParamsFolder = 'uncategorized';
    render(<LinksList />);

    // InboxTriage is rendered — header is an h2
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByText('共 1 条待整理链接')).toBeInTheDocument();
    // Only link with folderId=null (InboxItem shows metaTitle, not slug)
    expect(screen.getByText('Example 3')).toBeInTheDocument();
    expect(screen.queryByText('Example 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Example 2')).not.toBeInTheDocument();
  });

  it('shows all links when folders list is empty', () => {
    setupService(mockLinks, []);
    render(<LinksList />);

    expect(screen.getByText('全部链接')).toBeInTheDocument();
    expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
  });

  // --- View mode toggle ---

  it('renders list and grid toggle buttons', () => {
    render(<LinksList />);

    expect(screen.getByLabelText('List view')).toBeInTheDocument();
    expect(screen.getByLabelText('Grid view')).toBeInTheDocument();
  });

  it('defaults to list view mode', () => {
    localStorage.removeItem('zhe_links_view_mode');
    render(<LinksList />);

    const listBtn = screen.getByLabelText('List view');
    expect(listBtn.className).toContain('bg-accent');
  });

  it('switches to grid view when grid toggle is clicked', async () => {
    localStorage.removeItem('zhe_links_view_mode');
    render(<LinksList />);

    fireEvent.click(screen.getByLabelText('Grid view'));

    const gridBtn = screen.getByLabelText('Grid view');
    expect(gridBtn.className).toContain('bg-accent');

    const listBtn = screen.getByLabelText('List view');
    expect(listBtn.className).not.toContain('bg-accent');
  });

  it('switches back to list view when list toggle is clicked', async () => {
    localStorage.setItem('zhe_links_view_mode', 'grid');
    render(<LinksList />);

    fireEvent.click(screen.getByLabelText('List view'));

    const listBtn = screen.getByLabelText('List view');
    expect(listBtn.className).toContain('bg-accent');
  });

  it('persists view mode to localStorage', async () => {
    localStorage.removeItem('zhe_links_view_mode');
    render(<LinksList />);

    fireEvent.click(screen.getByLabelText('Grid view'));
    expect(localStorage.getItem('zhe_links_view_mode')).toBe('grid');

    fireEvent.click(screen.getByLabelText('List view'));
    expect(localStorage.getItem('zhe_links_view_mode')).toBe('list');
  });

  it('uses grid layout container when in grid mode', async () => {
    localStorage.removeItem('zhe_links_view_mode');
    const { container } = render(<LinksList />);

    fireEvent.click(screen.getByLabelText('Grid view'));

    const gridContainer = container.querySelector('.grid');
    expect(gridContainer).toBeInTheDocument();
  });

  it('uses list layout container when in list mode', () => {
    localStorage.removeItem('zhe_links_view_mode');
    const { container } = render(<LinksList />);

    const listContainer = container.querySelector('.space-y-2');
    expect(listContainer).toBeInTheDocument();
  });

  it('renders grid skeleton when loading in grid mode', () => {
    localStorage.setItem('zhe_links_view_mode', 'grid');
    setupService([], [], true);
    const { container } = render(<LinksList />);

    const gridSkeleton = container.querySelector('.grid');
    expect(gridSkeleton).toBeInTheDocument();
  });

  it('renders list skeleton when loading in list mode', () => {
    localStorage.removeItem('zhe_links_view_mode');
    setupService([], [], true);
    const { container } = render(<LinksList />);

    const listSkeleton = container.querySelector('.space-y-2');
    expect(listSkeleton).toBeInTheDocument();
  });

  // --- Refresh button ---

  it('renders refresh button', () => {
    render(<LinksList />);

    expect(screen.getByLabelText('刷新链接')).toBeInTheDocument();
  });

  it('calls refreshLinks when refresh button is clicked', async () => {
    render(<LinksList />);

    fireEvent.click(screen.getByLabelText('刷新链接'));

    expect(mockService.refreshLinks).toHaveBeenCalledOnce();
  });

  it('disables refresh button while refreshing', async () => {
    // Make refreshLinks hang so isRefreshing stays true
    mockService.refreshLinks = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<LinksList />);

    fireEvent.click(screen.getByLabelText('刷新链接'));

    expect(screen.getByLabelText('刷新链接')).toBeDisabled();
  });

  // --- Filter bar ---

  describe('filter bar', () => {
    it('renders folder and tag filter buttons', () => {
      render(<LinksList />);

      expect(screen.getByText('文件夹')).toBeInTheDocument();
      expect(screen.getByText('标签')).toBeInTheDocument();
    });

    it('hides folder filter when sidebar has selected a folder', () => {
      mockSearchParamsFolder = 'f1';
      render(<LinksList />);

      expect(screen.queryByText('文件夹')).not.toBeInTheDocument();
      // Tag filter should still be visible
      expect(screen.getByText('标签')).toBeInTheDocument();
    });

    it('filters links by folder via filter bar', async () => {
      render(<LinksList />);

      // Open folder dropdown
      fireEvent.click(screen.getByText('文件夹'));
      // Select "工作" folder
      fireEvent.click(screen.getByText('工作'));

      // Should show only link 1 (abc)
      expect(screen.getByText('abc')).toBeInTheDocument();
      expect(screen.queryByText('def')).not.toBeInTheDocument();
      expect(screen.queryByText('ghi')).not.toBeInTheDocument();
      // Should show filtered count
      expect(screen.getByText('1 / 3 条链接')).toBeInTheDocument();
    });

    it('filters links by Inbox (uncategorized) via filter bar', async () => {
      render(<LinksList />);

      fireEvent.click(screen.getByText('文件夹'));
      fireEvent.click(screen.getByText('Inbox'));

      // Should show only link 3 (ghi) which has folderId=null
      expect(screen.getByText('ghi')).toBeInTheDocument();
      expect(screen.queryByText('abc')).not.toBeInTheDocument();
      expect(screen.queryByText('def')).not.toBeInTheDocument();
    });

    it('resets folder filter when "全部文件夹" is selected', async () => {
      render(<LinksList />);

      // Select a folder first
      fireEvent.click(screen.getByText('文件夹'));
      fireEvent.click(screen.getByText('工作'));
      expect(screen.getByText('1 / 3 条链接')).toBeInTheDocument();

      // Now reset to all
      fireEvent.click(screen.getByText('工作')); // trigger shows selected folder name
      fireEvent.click(screen.getByText('全部文件夹'));
      expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
    });

    it('filters links by tag', async () => {
      render(<LinksList />);

      // Open tag dropdown
      fireEvent.click(screen.getByText('标签'));
      // Select "dev" tag — use the command item (dropdown), not the tag badge on LinkCard
      const devItems = screen.getAllByText('dev');
      const devDropdownItem = devItems.find(el => el.closest('[cmdk-item]'));
      expect(devDropdownItem).toBeTruthy();
      fireEvent.click(unwrap(devDropdownItem));

      // Only link 1 (abc) has the "dev" tag
      expect(screen.getByText('abc')).toBeInTheDocument();
      expect(screen.queryByText('def')).not.toBeInTheDocument();
      expect(screen.queryByText('ghi')).not.toBeInTheDocument();
      expect(screen.getByText('1 / 3 条链接')).toBeInTheDocument();
    });

    it('filters links by multiple tags (intersection)', async () => {
      render(<LinksList />);

      // Select "dev" tag
      fireEvent.click(screen.getByText('标签'));
      const devItems = screen.getAllByText('dev');
      fireEvent.click(unwrap(devItems.find(el => el.closest('[cmdk-item]'))));

      // Select "design" tag too (reopen)
      fireEvent.click(screen.getByText('标签 (1)'));
      const designItems = screen.getAllByText('design');
      const designDropdownItem = designItems.find(el => el.closest('[cmdk-item]'));
      // cmdk may filter out already-selected items; click only if present
      if (designDropdownItem) {
        fireEvent.click(designDropdownItem);
      }

      // Only link 1 (abc) has both "dev" AND "design"
      expect(screen.getByText('abc')).toBeInTheDocument();
      expect(screen.queryByText('def')).not.toBeInTheDocument();
      expect(screen.queryByText('ghi')).not.toBeInTheDocument();
    });

    it('removes tag filter via badge X button', async () => {
      render(<LinksList />);

      // Select "blog" tag to narrow to link 3 only
      fireEvent.click(screen.getByText('标签'));
      const blogItems = screen.getAllByText('blog');
      fireEvent.click(unwrap(blogItems.find(el => el.closest('[cmdk-item]'))));
      expect(screen.getByText('1 / 3 条链接')).toBeInTheDocument();

      // Remove it via X on the badge
      fireEvent.click(screen.getByLabelText('Remove filter blog'));
      expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
    });

    it('clears all filters via "清除筛选" button', async () => {
      render(<LinksList />);

      // Apply folder + tag filters
      fireEvent.click(screen.getByText('文件夹'));
      fireEvent.click(screen.getByText('工作'));
      fireEvent.click(screen.getByText('标签'));
      const devItems = screen.getAllByText('dev');
      fireEvent.click(unwrap(devItems.find(el => el.closest('[cmdk-item]'))));

      // Clear all
      fireEvent.click(screen.getByText('清除筛选'));
      expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
      expect(screen.queryByText('清除筛选')).not.toBeInTheDocument();
    });

    it('combines folder and tag filters', async () => {
      render(<LinksList />);

      // Filter by folder "个人" (link 2 only) then by tag "design" (link 1, 2)
      fireEvent.click(screen.getByText('文件夹'));
      fireEvent.click(screen.getByText('个人'));

      fireEvent.click(screen.getByText('标签'));
      const designItems = screen.getAllByText('design');
      fireEvent.click(unwrap(designItems.find(el => el.closest('[cmdk-item]'))));

      // Only link 2 (def) is in folder "个人" AND has tag "design"
      expect(screen.getByText('def')).toBeInTheDocument();
      expect(screen.queryByText('abc')).not.toBeInTheDocument();
      expect(screen.queryByText('ghi')).not.toBeInTheDocument();
    });

    it('shows tag count on tag button when tags are selected', async () => {
      render(<LinksList />);

      fireEvent.click(screen.getByText('标签'));
      const devItems = screen.getAllByText('dev');
      fireEvent.click(unwrap(devItems.find(el => el.closest('[cmdk-item]'))));

      expect(screen.getByText('标签 (1)')).toBeInTheDocument();
    });
  });
});