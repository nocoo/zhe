// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('InboxTriage (interactions)', () => {
  beforeEach(() => {
    setupService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });


  describe('folder selector onChange', () => {
    it('renders Inbox as default in trigger when no folder selected', () => {
      render(<InboxTriage />);

      const triggers = screen.getAllByLabelText('文件夹');
      expect(triggers[0]).toHaveTextContent('Inbox');
    });

    it('renders all folder options when trigger is clicked', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      // Click the first folder select trigger to open the dropdown
      const triggers = screen.getAllByRole('combobox');
      await user.click(unwrap(triggers[0]));

      // Radix Select should render listbox with options via portal
      const listbox = screen.getByRole('listbox');
      const options = screen.getAllByRole('option');
      const optionTexts = options.map(o => o.textContent);
      expect(optionTexts).toContain('Inbox');
      expect(optionTexts).toContain('Work');
      expect(optionTexts).toContain('Personal');
      expect(listbox).toBeInTheDocument();
    });

    it('updates trigger text when a folder option is selected', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      // Open the first folder select
      const triggers = screen.getAllByRole('combobox');
      await user.click(unwrap(triggers[0]));

      // Select "Work" folder
      const workOption = screen.getByRole('option', { name: 'Work' });
      await user.click(workOption);

      // Trigger should now show "Work" instead of "Inbox"
      expect(triggers[0]).toHaveTextContent('Work');
    });
  });

  // ── Note input onChange ──

  describe('note input onChange', () => {
    it('updates note value as user types', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const inputs = screen.getAllByPlaceholderText('添加备注...');
      await user.type(unwrap(inputs[0]), 'hello world');

      expect(inputs[0]).toHaveValue('hello world');
    });
  });

  // ── Save button click ──

  describe('save button click', () => {
    it('triggers save action when clicked', async () => {
      const { updateLink } = await import('@/actions/links');
      (updateLink as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: { ...inboxLink1, folderId: null } });

      const user = userEvent.setup();
      render(<InboxTriage />);

      const saveButtons = screen.getAllByRole('button', { name: '保存' });
      await user.click(unwrap(saveButtons[0]));

      expect(updateLink).toHaveBeenCalled();
    });
  });

  // ── Tag remove button click ──

  describe('tag remove', () => {
    it('calls removeTagFromLink when tag remove button is clicked', async () => {
      const { removeTagFromLink } = await import('@/actions/tags');
      (removeTagFromLink as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      const linkTags: LinkTag[] = [
        { linkId: 1, tagId: 't1' },
      ];
      setupService({ linkTags });
      const user = userEvent.setup();
      render(<InboxTriage />);

      const removeBtn = screen.getByLabelText('Remove tag Important');
      await user.click(removeBtn);

      // Should trigger optimistic removal through the VM
      expect(mockService.handleLinkTagRemoved).toHaveBeenCalledWith(1, 't1');
    });
  });

  // ── Tag picker ──

  describe('tag picker', () => {
    it('opens tag picker popover when add tag button is clicked', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const addButtons = screen.getAllByLabelText('Add tag');
      await user.click(unwrap(addButtons[0]));

      expect(screen.getByPlaceholderText('搜索或创建标签...')).toBeInTheDocument();
    });

    it('selects an existing tag from picker', async () => {
      const { addTagToLink } = await import('@/actions/tags');
      (addTagToLink as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      const user = userEvent.setup();
      render(<InboxTriage />);

      // Open the tag picker for the first inbox link
      const addButtons = screen.getAllByLabelText('Add tag');
      await user.click(unwrap(addButtons[0]));

      // Click on a tag in the picker
      const tagOption = screen.getByText('Important');
      await user.click(tagOption);

      // Should call onLinkTagAdded optimistically
      expect(mockService.handleLinkTagAdded).toHaveBeenCalledWith({ linkId: 1, tagId: 't1' });
    });

    it('creates a new tag when user types a non-existing name and selects create', async () => {
      const { createTag } = await import('@/actions/tags');
      (createTag as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: makeTag({ id: 't-new', name: 'NewTag', color: 'gray' }),
      });

      const { addTagToLink } = await import('@/actions/tags');
      (addTagToLink as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      const user = userEvent.setup();
      render(<InboxTriage />);

      const addButtons = screen.getAllByLabelText('Add tag');
      await user.click(unwrap(addButtons[0]));

      // Type a non-existing tag name
      const searchInput = screen.getByPlaceholderText('搜索或创建标签...');
      await user.type(searchInput, 'NewTag');

      // The "创建" option should appear
      const createOption = screen.getByText(/创建/);
      await user.click(createOption);

      expect(createTag).toHaveBeenCalledWith({ name: 'NewTag' });
    });
  });

  // ── Delete confirmation ──

  describe('delete confirmation action', () => {
    it('calls deleteLink and handleLinkDeleted on successful delete', async () => {
      const { deleteLink } = await import('@/actions/links');
      (deleteLink as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      const user = userEvent.setup();
      render(<InboxTriage />);

      // Open delete dialog
      const deleteButtons = screen.getAllByLabelText('Delete link');
      await user.click(unwrap(deleteButtons[0]));

      // Click confirm
      const confirmBtn = screen.getByRole('button', { name: '删除' });
      await user.click(confirmBtn);

      expect(deleteLink).toHaveBeenCalledWith(1);
      await vi.waitFor(() => {
        expect(mockService.handleLinkDeleted).toHaveBeenCalledWith(1);
      });
    });

    it('closes dialog on cancel', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const deleteButtons = screen.getAllByLabelText('Delete link');
      await user.click(unwrap(deleteButtons[0]));

      // Dialog is open
      expect(screen.getByText('确认删除')).toBeInTheDocument();

      // Cancel
      await user.click(screen.getByRole('button', { name: '取消' }));

      // Dialog should close
      await vi.waitFor(() => {
        expect(screen.queryByText('确认删除')).not.toBeInTheDocument();
      });
    });
  });

  // ── Edit button (from LinkCard) ──

  describe('edit button', () => {
    it('shows edit button from LinkCard', () => {
      render(<InboxTriage />);

      const editButtons = screen.getAllByLabelText('Edit link');
      expect(editButtons).toHaveLength(2);
    });
  });

  // ── LinkCard capabilities inherited ──

  describe('LinkCard capabilities', () => {
    it('shows refresh metadata button from LinkCard', () => {
      render(<InboxTriage />);

      const refreshButtons = screen.getAllByLabelText('Refresh metadata');
      expect(refreshButtons).toHaveLength(2);
    });

    it('shows refresh preview button from LinkCard', () => {
      render(<InboxTriage />);

      const previewButtons = screen.getAllByLabelText('Refresh preview');
      expect(previewButtons).toHaveLength(2);
    });

    it('shows copy link button from LinkCard', () => {
      render(<InboxTriage />);

      const copyButtons = screen.getAllByLabelText('Copy link');
      expect(copyButtons).toHaveLength(2);
    });
  });
});
