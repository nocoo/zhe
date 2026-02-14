import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FolderSelectionProvider } from '@/contexts/folder-selection-context';
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

import { LinksList } from '@/components/dashboard/links-list';

const siteUrl = 'https://zhe.to';

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

function renderWithFolderSelection(props: Partial<Parameters<typeof LinksList>[0]> = {}) {
  return render(
    <FolderSelectionProvider selectedFolderId={mockSearchParamsFolder} folders={mockFolders}>
      <LinksList
        initialLinks={mockLinks}
        siteUrl={siteUrl}
        {...props}
      />
    </FolderSelectionProvider>
  );
}

describe('LinksList folder filtering', () => {
  beforeEach(() => {
    mockSearchParamsFolder = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows all links when no folder is selected', () => {
    mockSearchParamsFolder = null;
    renderWithFolderSelection();

    expect(screen.getByText('全部链接')).toBeInTheDocument();
    expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
    expect(screen.getByText('zhe.to/abc')).toBeInTheDocument();
    expect(screen.getByText('zhe.to/def')).toBeInTheDocument();
    expect(screen.getByText('zhe.to/ghi')).toBeInTheDocument();
  });

  it('filters links by selected folder', () => {
    mockSearchParamsFolder = 'f1';
    renderWithFolderSelection();

    expect(screen.getByText('工作')).toBeInTheDocument();
    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
    expect(screen.getByText('zhe.to/abc')).toBeInTheDocument();
    expect(screen.queryByText('zhe.to/def')).not.toBeInTheDocument();
    expect(screen.queryByText('zhe.to/ghi')).not.toBeInTheDocument();
  });

  it('shows folder name as header when folder is selected', () => {
    mockSearchParamsFolder = 'f2';
    renderWithFolderSelection();

    expect(screen.getByText('个人')).toBeInTheDocument();
    expect(screen.queryByText('全部链接')).not.toBeInTheDocument();
  });

  it('shows correct count for filtered links', () => {
    mockSearchParamsFolder = 'f2';
    renderWithFolderSelection();

    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
  });

  it('shows empty state when selected folder has no links', () => {
    mockSearchParamsFolder = 'f-nonexistent';
    renderWithFolderSelection();

    expect(screen.getByText('暂无链接')).toBeInTheDocument();
    expect(screen.getByText('共 0 条链接')).toBeInTheDocument();
  });

  it('shows uncategorized links when folder=uncategorized', () => {
    mockSearchParamsFolder = 'uncategorized';
    renderWithFolderSelection();

    expect(screen.getByText('未分类')).toBeInTheDocument();
    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
    // Only link with folderId=null
    expect(screen.getByText('zhe.to/ghi')).toBeInTheDocument();
    expect(screen.queryByText('zhe.to/abc')).not.toBeInTheDocument();
    expect(screen.queryByText('zhe.to/def')).not.toBeInTheDocument();
  });

  it('works without FolderSelectionProvider (defaults to showing all)', () => {
    // Render without the provider — should default to null selectedFolderId and empty folders
    render(
      <LinksList
        initialLinks={mockLinks}
        siteUrl={siteUrl}
      />
    );

    expect(screen.getByText('全部链接')).toBeInTheDocument();
    expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
  });
});
