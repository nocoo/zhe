// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { LinkTag } from '@/models/types';
import type { DashboardService } from '@/contexts/dashboard-service';
import { unwrap } from '../test-utils';
import { makeLink, makeFolder, makeTag } from '../fixtures';

// ── Mocks ──

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, unoptimized, ...rest } = props;
    void fill; void priority; void unoptimized;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard',
}));

vi.mock('@/actions/links', () => ({
  updateLink: vi.fn(),
  updateLinkNote: vi.fn(),
  deleteLink: vi.fn(),
  refreshLinkMetadata: vi.fn(),
  getAnalyticsStats: vi.fn(),
  fetchAndSaveScreenshot: vi.fn(),
}));

vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>();
  return {
    ...actual,
    copyToClipboard: vi.fn().mockResolvedValue(true),
    formatDate: (date: Date | string) => `formatted:${String(date)}`,
    formatNumber: (n: number) => `num:${n}`,
  };
});

vi.mock('@/actions/tags', () => ({
  createTag: vi.fn(),
  addTagToLink: vi.fn(),
  removeTagFromLink: vi.fn(),
}));

vi.mock('@/models/links', () => ({
  extractHostname: (url: string) => {
    try { return new URL(url).hostname; } catch { return url; }
  },
  buildShortUrl: (siteUrl: string, slug: string) => `${siteUrl}/${slug}`,
  topBreakdownEntries: (breakdown: Record<string, number>, n: number) =>
    Object.entries(breakdown).sort((a, b) => b[1] - a[1]).slice(0, n) as [string, number][],
  isGitHubRepoUrl: () => false,
  GITHUB_REPO_PREVIEW_URL: 'https://github.com/preview.png',
}));

vi.mock('@/models/settings', () => ({
  buildFaviconUrl: () => null,
}));

vi.mock('@/models/tags', () => ({
  getTagStyles: (name: string) => ({
    badge: { backgroundColor: `mock-bg-${name}`, color: `mock-color-${name}` },
    dot: { backgroundColor: `mock-dot-${name}` },
  }),
}));

const mockService: DashboardService = {
  links: [],
  folders: [],
  tags: [],
  linkTags: [],
  ideas: [],
  loading: false,
  ideasLoading: false,
  siteUrl: 'https://zhe.sh',
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

import { InboxTriage } from '@/components/dashboard/inbox-triage';

// ── Test data ──

const inboxLink1 = makeLink({ id: 1, metaTitle: 'Inbox Link 1', originalUrl: 'https://example.com/1' });
const inboxLink2 = makeLink({ id: 2, metaTitle: 'Inbox Link 2', originalUrl: 'https://example.com/2', metaFavicon: null, metaDescription: null });
const categorizedLink = makeLink({ id: 3, metaTitle: 'Categorized Link', originalUrl: 'https://example.com/3', folderId: 'f1' });

const mockFolders = [
  makeFolder({ id: 'f1', userId: 'u1', name: 'Work', icon: 'briefcase', createdAt: new Date('2026-01-01') }),
  makeFolder({ id: 'f2', userId: 'u1', name: 'Personal', icon: 'heart', createdAt: new Date('2026-01-02') }),
];

const mockTags = [
  makeTag({ id: 't1', userId: 'u1', name: 'Important', color: 'red', createdAt: new Date('2026-01-01') }),
  makeTag({ id: 't2', userId: 'u1', name: 'Read Later', color: 'blue', createdAt: new Date('2026-01-02') }),
];

function setupService(overrides: Partial<DashboardService> = {}) {
  mockService.links = overrides.links ?? [inboxLink1, inboxLink2, categorizedLink];
  mockService.folders = overrides.folders ?? mockFolders;
  mockService.tags = overrides.tags ?? mockTags;
  mockService.linkTags = overrides.linkTags ?? [];
  mockService.loading = overrides.loading ?? false;
}

// ── Tests ──

describe('InboxTriage', () => {
  beforeEach(() => {
    setupService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Loading state ──

  describe('loading state', () => {
    it('shows skeleton placeholders when loading', () => {
      setupService({ loading: true });
      const { container } = render(<InboxTriage />);

      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show header or links while loading', () => {
      setupService({ loading: true });
      render(<InboxTriage />);

      expect(screen.queryByRole('heading', { name: 'Inbox' })).not.toBeInTheDocument();
      expect(screen.queryByText('Inbox Link 1')).not.toBeInTheDocument();
    });
  });

  // ── Empty state ──

  describe('empty state', () => {
    it('shows empty message when no uncategorized links', () => {
      setupService({ links: [categorizedLink] });
      render(<InboxTriage />);

      expect(screen.getByText('Inbox 已清空')).toBeInTheDocument();
      expect(screen.getByText('所有链接都已整理到文件夹中')).toBeInTheDocument();
    });

    it('shows zero count in header when inbox is empty', () => {
      setupService({ links: [categorizedLink] });
      render(<InboxTriage />);

      expect(screen.getByText('共 0 条待整理链接')).toBeInTheDocument();
    });

    it('shows empty message when links array is empty', () => {
      setupService({ links: [] });
      render(<InboxTriage />);

      expect(screen.getByText('Inbox 已清空')).toBeInTheDocument();
    });
  });

  // ── Header ──

  describe('header', () => {
    it('shows Inbox heading', () => {
      render(<InboxTriage />);

      expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    });

    it('shows correct count of uncategorized links', () => {
      render(<InboxTriage />);

      // 2 inbox links (inboxLink1, inboxLink2); categorizedLink has folderId
      expect(screen.getByText('共 2 条待整理链接')).toBeInTheDocument();
    });

    it('updates count when only one inbox link exists', () => {
      setupService({ links: [inboxLink1, categorizedLink] });
      render(<InboxTriage />);

      expect(screen.getByText('共 1 条待整理链接')).toBeInTheDocument();
    });
  });

  // ── Renders inbox items using LinkCard ──

  describe('inbox items rendering', () => {
    it('renders LinkCard for each inbox link', () => {
      render(<InboxTriage />);

      const cards = screen.getAllByTestId('link-card');
      expect(cards).toHaveLength(2);
    });

    it('does not render LinkCard for categorized links', () => {
      render(<InboxTriage />);

      const cards = screen.getAllByTestId('link-card');
      expect(cards).toHaveLength(2); // only 2 inbox links, not the categorized one
    });
  });

  // ── Only shows uncategorized links ──

  describe('filtering', () => {
    it('only shows links with folderId === null', () => {
      render(<InboxTriage />);

      const cards = screen.getAllByTestId('link-card');
      expect(cards).toHaveLength(2);
    });
  });

  // ── Folder selector ──

  describe('folder selector', () => {
    it('renders folder select triggers for each inbox link', () => {
      render(<InboxTriage />);

      // Each inbox link renders a Label with htmlFor pointing to the SelectTrigger id
      const triggers = screen.getAllByLabelText('文件夹');
      expect(triggers).toHaveLength(2);
    });

    it('shows Inbox as default selected value', () => {
      render(<InboxTriage />);

      const triggers = screen.getAllByLabelText('文件夹');
      expect(triggers[0]).toHaveTextContent('Inbox');
      expect(triggers[1]).toHaveTextContent('Inbox');
    });

    it('shows folder label', () => {
      render(<InboxTriage />);

      const labels = screen.getAllByText('文件夹');
      expect(labels.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Note input ──

  describe('note input', () => {
    it('shows note input with placeholder', () => {
      render(<InboxTriage />);

      const inputs = screen.getAllByPlaceholderText('添加备注...');
      expect(inputs.length).toBeGreaterThanOrEqual(1);
    });

    it('shows note label', () => {
      render(<InboxTriage />);

      const labels = screen.getAllByText('备注');
      expect(labels.length).toBeGreaterThanOrEqual(1);
    });

    it('allows typing into note input', async () => {
      render(<InboxTriage />);

      const inputs = screen.getAllByPlaceholderText('添加备注...');
      fireEvent.change(unwrap(inputs[0]), { target: { value: 'my note' } });

      expect(inputs[0]).toHaveValue('my note');
    });
  });

  // ── Save button ──

  describe('save button', () => {
    it('shows save button for each inbox link', () => {
      render(<InboxTriage />);

      const saveButtons = screen.getAllByRole('button', { name: '保存' });
      expect(saveButtons).toHaveLength(2);
    });
  });

  // ── Tags display ──

  describe('tags display', () => {
    it('shows assigned tags in triage controls', () => {
      const linkTags: LinkTag[] = [
        { linkId: 1, tagId: 't1' },
      ];
      setupService({ linkTags });
      render(<InboxTriage />);

      // "Important" tag appears in triage controls with remove button
      expect(screen.getByLabelText('Remove tag Important')).toBeInTheDocument();
    });

    it('shows add tag button', () => {
      render(<InboxTriage />);

      const addButtons = screen.getAllByLabelText('Add tag');
      expect(addButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Delete button (from LinkCard) ──

  describe('delete button', () => {
    it('shows delete button from LinkCard', () => {
      render(<InboxTriage />);

      const deleteButtons = screen.getAllByLabelText('Delete link');
      expect(deleteButtons).toHaveLength(2);
    });

    it('opens confirmation dialog when clicked', async () => {
      render(<InboxTriage />);

      const deleteButtons = screen.getAllByLabelText('Delete link');
      fireEvent.click(unwrap(deleteButtons[0]));

      expect(screen.getByText('确认删除')).toBeInTheDocument();
      expect(screen.getByText('此操作不可撤销，确定要删除这条链接吗？')).toBeInTheDocument();
    });

    it('shows cancel and confirm buttons in dialog', async () => {
      render(<InboxTriage />);

      const deleteButtons = screen.getAllByLabelText('Delete link');
      fireEvent.click(unwrap(deleteButtons[0]));

      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    });
  });

  // ── Error display ──

  describe('error display', () => {
    it('does not show error text when draft has no error', () => {
      render(<InboxTriage />);

      const errorElements = document.querySelectorAll('.text-destructive');
      expect(errorElements).toHaveLength(0);
    });
  });

  // ── Refresh button ──

  describe('refresh button', () => {
    it('shows refresh button in header', () => {
      render(<InboxTriage />);

      expect(screen.getByRole('button', { name: '刷新链接' })).toBeInTheDocument();
    });

    it('shows 刷新 text on button', () => {
      render(<InboxTriage />);

      expect(screen.getByRole('button', { name: '刷新链接' })).toHaveTextContent('刷新');
    });

    it('calls refreshLinks when clicked', async () => {
      render(<InboxTriage />);

      fireEvent.click(screen.getByRole('button', { name: '刷新链接' }));

      expect(mockService.refreshLinks).toHaveBeenCalledTimes(1);
    });

    it('disables button while refreshing', async () => {
      // Make refreshLinks block so we can inspect the disabled state
      let resolveRefresh!: () => void;
      (mockService.refreshLinks as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise<void>((r) => { resolveRefresh = r; }),
      );
      render(<InboxTriage />);

      const btn = screen.getByRole('button', { name: '刷新链接' });
      fireEvent.click(btn);

      // Button should be disabled while refreshing
      expect(btn).toBeDisabled();

      // Resolve the promise and wait for state update
      resolveRefresh();
      await vi.waitFor(() => {
        expect(btn).not.toBeDisabled();
      });
    });
  });

  // ── Folder selector onChange ──
});
