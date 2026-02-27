import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Link, Folder, Tag, LinkTag } from '@/models/types';
import type { DashboardService } from '@/contexts/dashboard-service';

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

// Mock DashboardService context — mutable so each test can set its own data
const mockService: DashboardService = {
  links: [],
  folders: [],
  tags: [],
  linkTags: [],
  loading: false,
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
};

vi.mock('@/contexts/dashboard-service', () => ({
  useDashboardService: () => mockService,
}));

import { LinksList } from '@/components/dashboard/links-list';

const mockLinks: Link[] = [
  {
    id: 1,
    userId: 'u1',
    slug: 'abc',
    originalUrl: 'https://example.com/1',
    isCustom: false,
    clicks: 10,
    createdAt: new Date('2026-01-01'),
    expiresAt: null,
    folderId: 'f1',
    metaTitle: 'Example 1',
    metaDescription: null,
    metaFavicon: 'https://example.com/favicon.ico',
    screenshotUrl: 'https://screenshot.example.com/1.png',
    note: null,
  },
  {
    id: 2,
    userId: 'u1',
    slug: 'def',
    originalUrl: 'https://example.com/2',
    isCustom: false,
    clicks: 5,
    createdAt: new Date('2026-01-02'),
    expiresAt: null,
    folderId: 'f2',
    metaTitle: 'Example 2',
    metaDescription: null,
    metaFavicon: 'https://example.com/favicon.ico',
    screenshotUrl: 'https://screenshot.example.com/2.png',
    note: null,
  },
  {
    id: 3,
    userId: 'u1',
    slug: 'ghi',
    originalUrl: 'https://example.com/3',
    isCustom: false,
    clicks: 0,
    createdAt: new Date('2026-01-03'),
    expiresAt: null,
    folderId: null,
    metaTitle: 'Example 3',
    metaDescription: null,
    metaFavicon: 'https://example.com/favicon.ico',
    screenshotUrl: 'https://screenshot.example.com/3.png',
    note: null,
  },
];

const mockFolders: Folder[] = [
  { id: 'f1', userId: 'u1', name: '工作', icon: 'briefcase', createdAt: new Date('2026-01-01') },
  { id: 'f2', userId: 'u1', name: '个人', icon: 'heart', createdAt: new Date('2026-01-02') },
];

const mockTags: Tag[] = [
  { id: 't1', userId: 'u1', name: 'dev', color: 'cobalt', createdAt: new Date('2026-01-01') },
  { id: 't2', userId: 'u1', name: 'design', color: 'rose', createdAt: new Date('2026-01-02') },
  { id: 't3', userId: 'u1', name: 'blog', color: 'green', createdAt: new Date('2026-01-03') },
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
    const user = userEvent.setup();
    render(<LinksList />);

    await user.click(screen.getByLabelText('Grid view'));

    const gridBtn = screen.getByLabelText('Grid view');
    expect(gridBtn.className).toContain('bg-accent');

    const listBtn = screen.getByLabelText('List view');
    expect(listBtn.className).not.toContain('bg-accent');
  });

  it('switches back to list view when list toggle is clicked', async () => {
    localStorage.setItem('zhe_links_view_mode', 'grid');
    const user = userEvent.setup();
    render(<LinksList />);

    await user.click(screen.getByLabelText('List view'));

    const listBtn = screen.getByLabelText('List view');
    expect(listBtn.className).toContain('bg-accent');
  });

  it('persists view mode to localStorage', async () => {
    localStorage.removeItem('zhe_links_view_mode');
    const user = userEvent.setup();
    render(<LinksList />);

    await user.click(screen.getByLabelText('Grid view'));
    expect(localStorage.getItem('zhe_links_view_mode')).toBe('grid');

    await user.click(screen.getByLabelText('List view'));
    expect(localStorage.getItem('zhe_links_view_mode')).toBe('list');
  });

  it('uses grid layout container when in grid mode', async () => {
    localStorage.removeItem('zhe_links_view_mode');
    const user = userEvent.setup();
    const { container } = render(<LinksList />);

    await user.click(screen.getByLabelText('Grid view'));

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
    const user = userEvent.setup();
    render(<LinksList />);

    await user.click(screen.getByLabelText('刷新链接'));

    expect(mockService.refreshLinks).toHaveBeenCalledOnce();
  });

  it('disables refresh button while refreshing', async () => {
    // Make refreshLinks hang so isRefreshing stays true
    mockService.refreshLinks = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<LinksList />);

    await user.click(screen.getByLabelText('刷新链接'));

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
      const user = userEvent.setup();
      render(<LinksList />);

      // Open folder dropdown
      await user.click(screen.getByText('文件夹'));
      // Select "工作" folder
      await user.click(screen.getByText('工作'));

      // Should show only link 1 (abc)
      expect(screen.getByText('abc')).toBeInTheDocument();
      expect(screen.queryByText('def')).not.toBeInTheDocument();
      expect(screen.queryByText('ghi')).not.toBeInTheDocument();
      // Should show filtered count
      expect(screen.getByText('1 / 3 条链接')).toBeInTheDocument();
    });

    it('filters links by Inbox (uncategorized) via filter bar', async () => {
      const user = userEvent.setup();
      render(<LinksList />);

      await user.click(screen.getByText('文件夹'));
      await user.click(screen.getByText('Inbox'));

      // Should show only link 3 (ghi) which has folderId=null
      expect(screen.getByText('ghi')).toBeInTheDocument();
      expect(screen.queryByText('abc')).not.toBeInTheDocument();
      expect(screen.queryByText('def')).not.toBeInTheDocument();
    });

    it('resets folder filter when "全部文件夹" is selected', async () => {
      const user = userEvent.setup();
      render(<LinksList />);

      // Select a folder first
      await user.click(screen.getByText('文件夹'));
      await user.click(screen.getByText('工作'));
      expect(screen.getByText('1 / 3 条链接')).toBeInTheDocument();

      // Now reset to all
      await user.click(screen.getByText('工作')); // trigger shows selected folder name
      await user.click(screen.getByText('全部文件夹'));
      expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
    });

    it('filters links by tag', async () => {
      const user = userEvent.setup();
      render(<LinksList />);

      // Open tag dropdown
      await user.click(screen.getByText('标签'));
      // Select "dev" tag — use the command item (dropdown), not the tag badge on LinkCard
      const devItems = screen.getAllByText('dev');
      const devDropdownItem = devItems.find(el => el.closest('[cmdk-item]'));
      expect(devDropdownItem).toBeTruthy();
      await user.click(devDropdownItem!);

      // Only link 1 (abc) has the "dev" tag
      expect(screen.getByText('abc')).toBeInTheDocument();
      expect(screen.queryByText('def')).not.toBeInTheDocument();
      expect(screen.queryByText('ghi')).not.toBeInTheDocument();
      expect(screen.getByText('1 / 3 条链接')).toBeInTheDocument();
    });

    it('filters links by multiple tags (intersection)', async () => {
      const user = userEvent.setup();
      render(<LinksList />);

      // Select "dev" tag
      await user.click(screen.getByText('标签'));
      const devItems = screen.getAllByText('dev');
      await user.click(devItems.find(el => el.closest('[cmdk-item]'))!);

      // Select "design" tag too (reopen)
      await user.click(screen.getByText('标签 (1)'));
      const designItems = screen.getAllByText('design');
      await user.click(designItems.find(el => el.closest('[cmdk-item]'))!);

      // Only link 1 (abc) has both "dev" AND "design"
      expect(screen.getByText('abc')).toBeInTheDocument();
      expect(screen.queryByText('def')).not.toBeInTheDocument();
      expect(screen.queryByText('ghi')).not.toBeInTheDocument();
    });

    it('removes tag filter via badge X button', async () => {
      const user = userEvent.setup();
      render(<LinksList />);

      // Select "blog" tag to narrow to link 3 only
      await user.click(screen.getByText('标签'));
      const blogItems = screen.getAllByText('blog');
      await user.click(blogItems.find(el => el.closest('[cmdk-item]'))!);
      expect(screen.getByText('1 / 3 条链接')).toBeInTheDocument();

      // Remove it via X on the badge
      await user.click(screen.getByLabelText('Remove filter blog'));
      expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
    });

    it('clears all filters via "清除筛选" button', async () => {
      const user = userEvent.setup();
      render(<LinksList />);

      // Apply folder + tag filters
      await user.click(screen.getByText('文件夹'));
      await user.click(screen.getByText('工作'));
      await user.click(screen.getByText('标签'));
      const devItems = screen.getAllByText('dev');
      await user.click(devItems.find(el => el.closest('[cmdk-item]'))!);

      // Clear all
      await user.click(screen.getByText('清除筛选'));
      expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
      expect(screen.queryByText('清除筛选')).not.toBeInTheDocument();
    });

    it('combines folder and tag filters', async () => {
      const user = userEvent.setup();
      render(<LinksList />);

      // Filter by folder "个人" (link 2 only) then by tag "design" (link 1, 2)
      await user.click(screen.getByText('文件夹'));
      await user.click(screen.getByText('个人'));

      await user.click(screen.getByText('标签'));
      const designItems = screen.getAllByText('design');
      await user.click(designItems.find(el => el.closest('[cmdk-item]'))!);

      // Only link 2 (def) is in folder "个人" AND has tag "design"
      expect(screen.getByText('def')).toBeInTheDocument();
      expect(screen.queryByText('abc')).not.toBeInTheDocument();
      expect(screen.queryByText('ghi')).not.toBeInTheDocument();
    });

    it('shows tag count on tag button when tags are selected', async () => {
      const user = userEvent.setup();
      render(<LinksList />);

      await user.click(screen.getByText('标签'));
      const devItems = screen.getAllByText('dev');
      await user.click(devItems.find(el => el.closest('[cmdk-item]'))!);

      expect(screen.getByText('标签 (1)')).toBeInTheDocument();
    });
  });
});
