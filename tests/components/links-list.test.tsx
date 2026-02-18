import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Link, Folder } from '@/models/types';
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
  getAnalyticsStats: vi.fn(),
}));

vi.mock('@/actions/folders', () => ({
  getFolders: vi.fn(),
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
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
    screenshotUrl: null,
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
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
    screenshotUrl: null,
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
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
    screenshotUrl: null,
    note: null,
  },
];

const mockFolders: Folder[] = [
  { id: 'f1', userId: 'u1', name: '工作', icon: 'briefcase', createdAt: new Date('2026-01-01') },
  { id: 'f2', userId: 'u1', name: '个人', icon: 'heart', createdAt: new Date('2026-01-02') },
];

function setupService(links: Link[] = mockLinks, folders: Folder[] = mockFolders, loading = false) {
  mockService.links = links;
  mockService.folders = folders;
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
    expect(screen.getByText('localhost:3000/abc')).toBeInTheDocument();
    expect(screen.getByText('localhost:3000/def')).toBeInTheDocument();
    expect(screen.getByText('localhost:3000/ghi')).toBeInTheDocument();
  });

  it('filters links by selected folder', () => {
    mockSearchParamsFolder = 'f1';
    render(<LinksList />);

    expect(screen.getByText('工作')).toBeInTheDocument();
    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
    expect(screen.getByText('localhost:3000/abc')).toBeInTheDocument();
    expect(screen.queryByText('localhost:3000/def')).not.toBeInTheDocument();
    expect(screen.queryByText('localhost:3000/ghi')).not.toBeInTheDocument();
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

    expect(screen.getByText('未分类')).toBeInTheDocument();
    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
    // Only link with folderId=null
    expect(screen.getByText('localhost:3000/ghi')).toBeInTheDocument();
    expect(screen.queryByText('localhost:3000/abc')).not.toBeInTheDocument();
    expect(screen.queryByText('localhost:3000/def')).not.toBeInTheDocument();
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
});
