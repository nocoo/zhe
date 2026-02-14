import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Link, Folder } from '@/models/types';

let mockSearchParamsFolder: string | null = null;

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => key === 'folder' ? mockSearchParamsFolder : null,
  }),
}));

vi.mock('@/actions/links', () => ({
  getLinks: vi.fn(),
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  getAnalyticsStats: vi.fn(),
}));

vi.mock('@/actions/folders', () => ({
  getFolders: vi.fn(),
}));

import { LinksList } from '@/components/dashboard/links-list';
import { getLinks } from '@/actions/links';
import { getFolders } from '@/actions/folders';

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
  },
];

const mockFolders: Folder[] = [
  { id: 'f1', userId: 'u1', name: '工作', icon: 'briefcase', createdAt: new Date('2026-01-01') },
  { id: 'f2', userId: 'u1', name: '个人', icon: 'heart', createdAt: new Date('2026-01-02') },
];

function setupMocks(links: Link[] = mockLinks, folders: Folder[] = mockFolders) {
  vi.mocked(getLinks).mockResolvedValue({ success: true, data: links });
  vi.mocked(getFolders).mockResolvedValue({ success: true, data: folders });
}

async function renderLinksList() {
  const { act } = await import('@testing-library/react');
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<LinksList />);
  });
  return result!;
}

describe('LinksList', () => {
  beforeEach(() => {
    mockSearchParamsFolder = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows skeleton while loading', () => {
    // Don't resolve the mocks yet
    vi.mocked(getLinks).mockReturnValue(new Promise(() => {}));
    vi.mocked(getFolders).mockReturnValue(new Promise(() => {}));

    render(<LinksList />);

    // Should show skeleton (animate-pulse class)
    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
    expect(screen.queryByText('全部链接')).not.toBeInTheDocument();
  });

  it('shows all links when no folder is selected', async () => {
    mockSearchParamsFolder = null;
    setupMocks();
    await renderLinksList();

    expect(screen.getByText('全部链接')).toBeInTheDocument();
    expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
    expect(screen.getByText('localhost:3000/abc')).toBeInTheDocument();
    expect(screen.getByText('localhost:3000/def')).toBeInTheDocument();
    expect(screen.getByText('localhost:3000/ghi')).toBeInTheDocument();
  });

  it('filters links by selected folder', async () => {
    mockSearchParamsFolder = 'f1';
    setupMocks();
    await renderLinksList();

    expect(screen.getByText('工作')).toBeInTheDocument();
    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
    expect(screen.getByText('localhost:3000/abc')).toBeInTheDocument();
    expect(screen.queryByText('localhost:3000/def')).not.toBeInTheDocument();
    expect(screen.queryByText('localhost:3000/ghi')).not.toBeInTheDocument();
  });

  it('shows folder name as header when folder is selected', async () => {
    mockSearchParamsFolder = 'f2';
    setupMocks();
    await renderLinksList();

    expect(screen.getByText('个人')).toBeInTheDocument();
    expect(screen.queryByText('全部链接')).not.toBeInTheDocument();
  });

  it('shows correct count for filtered links', async () => {
    mockSearchParamsFolder = 'f2';
    setupMocks();
    await renderLinksList();

    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
  });

  it('shows empty state when selected folder has no links', async () => {
    mockSearchParamsFolder = 'f-nonexistent';
    setupMocks();
    await renderLinksList();

    expect(screen.getByText('暂无链接')).toBeInTheDocument();
    expect(screen.getByText('共 0 条链接')).toBeInTheDocument();
  });

  it('shows uncategorized links when folder=uncategorized', async () => {
    mockSearchParamsFolder = 'uncategorized';
    setupMocks();
    await renderLinksList();

    expect(screen.getByText('未分类')).toBeInTheDocument();
    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
    // Only link with folderId=null
    expect(screen.getByText('localhost:3000/ghi')).toBeInTheDocument();
    expect(screen.queryByText('localhost:3000/abc')).not.toBeInTheDocument();
    expect(screen.queryByText('localhost:3000/def')).not.toBeInTheDocument();
  });

  it('shows all links when folders list is empty', async () => {
    setupMocks(mockLinks, []);
    await renderLinksList();

    expect(screen.getByText('全部链接')).toBeInTheDocument();
    expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
  });
});
