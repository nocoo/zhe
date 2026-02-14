import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FolderSelectionProvider } from '@/contexts/folder-selection-context';
import type { Link, Folder } from '@/models/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
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

function renderWithFolderSelection(selectedFolderId: string | null, props: Partial<Parameters<typeof LinksList>[0]> = {}) {
  return render(
    <FolderSelectionProvider selectedFolderId={selectedFolderId}>
      <LinksList
        initialLinks={mockLinks}
        siteUrl={siteUrl}
        folders={mockFolders}
        {...props}
      />
    </FolderSelectionProvider>
  );
}

describe('LinksList folder filtering', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows all links when no folder is selected', () => {
    renderWithFolderSelection(null);

    expect(screen.getByText('全部链接')).toBeInTheDocument();
    expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
    expect(screen.getByText('zhe.to/abc')).toBeInTheDocument();
    expect(screen.getByText('zhe.to/def')).toBeInTheDocument();
    expect(screen.getByText('zhe.to/ghi')).toBeInTheDocument();
  });

  it('filters links by selected folder', () => {
    renderWithFolderSelection('f1');

    expect(screen.getByText('工作')).toBeInTheDocument();
    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
    expect(screen.getByText('zhe.to/abc')).toBeInTheDocument();
    expect(screen.queryByText('zhe.to/def')).not.toBeInTheDocument();
    expect(screen.queryByText('zhe.to/ghi')).not.toBeInTheDocument();
  });

  it('shows folder name as header when folder is selected', () => {
    renderWithFolderSelection('f2');

    expect(screen.getByText('个人')).toBeInTheDocument();
    expect(screen.queryByText('全部链接')).not.toBeInTheDocument();
  });

  it('shows correct count for filtered links', () => {
    renderWithFolderSelection('f2');

    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
  });

  it('shows empty state when selected folder has no links', () => {
    renderWithFolderSelection('f-nonexistent');

    expect(screen.getByText('暂无链接')).toBeInTheDocument();
    expect(screen.getByText('共 0 条链接')).toBeInTheDocument();
  });

  it('works without FolderSelectionProvider (defaults to showing all)', () => {
    // Render without the provider — should default to null selectedFolderId
    render(
      <LinksList
        initialLinks={mockLinks}
        siteUrl={siteUrl}
        folders={mockFolders}
      />
    );

    expect(screen.getByText('全部链接')).toBeInTheDocument();
    expect(screen.getByText('共 3 条链接')).toBeInTheDocument();
  });
});
