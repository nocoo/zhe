import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Link, Folder, Tag, LinkTag } from '@/models/types';
import type { DashboardService } from '@/contexts/dashboard-service';

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
}));

vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>();
  return {
    ...actual,
    copyToClipboard: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('@/actions/tags', () => ({
  createTag: vi.fn(),
  addTagToLink: vi.fn(),
  removeTagFromLink: vi.fn(),
}));

const mockService: DashboardService = {
  links: [],
  folders: [],
  tags: [],
  linkTags: [],
  loading: false,
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
};

vi.mock('@/contexts/dashboard-service', () => ({
  useDashboardService: () => mockService,
}));

import { InboxTriage } from '@/components/dashboard/inbox-triage';

// ── Test data ──

const makeLink = (overrides: Partial<Link> = {}): Link => ({
  id: 1,
  userId: 'u1',
  slug: 'abc',
  originalUrl: 'https://example.com/page',
  isCustom: false,
  clicks: 0,
  createdAt: new Date('2026-01-01'),
  expiresAt: null,
  folderId: null,
  metaTitle: 'Example Page',
  metaDescription: 'A description',
  metaFavicon: 'https://example.com/favicon.ico',
  screenshotUrl: null,
  note: null,
  ...overrides,
});

const inboxLink1 = makeLink({ id: 1, metaTitle: 'Inbox Link 1', originalUrl: 'https://example.com/1' });
const inboxLink2 = makeLink({ id: 2, metaTitle: 'Inbox Link 2', originalUrl: 'https://example.com/2', metaFavicon: null, metaDescription: null });
const categorizedLink = makeLink({ id: 3, metaTitle: 'Categorized Link', originalUrl: 'https://example.com/3', folderId: 'f1' });

const mockFolders: Folder[] = [
  { id: 'f1', userId: 'u1', name: 'Work', icon: 'briefcase', createdAt: new Date('2026-01-01') },
  { id: 'f2', userId: 'u1', name: 'Personal', icon: 'heart', createdAt: new Date('2026-01-02') },
];

const mockTags: Tag[] = [
  { id: 't1', userId: 'u1', name: 'Important', color: 'red', createdAt: new Date('2026-01-01') },
  { id: 't2', userId: 'u1', name: 'Read Later', color: 'blue', createdAt: new Date('2026-01-02') },
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

  // ── Renders inbox items ──

  describe('inbox items rendering', () => {
    it('shows metaTitle as display title', () => {
      render(<InboxTriage />);

      expect(screen.getByText('Inbox Link 1')).toBeInTheDocument();
      expect(screen.getByText('Inbox Link 2')).toBeInTheDocument();
    });

    it('falls back to originalUrl when metaTitle is null', () => {
      const noTitleLink = makeLink({ id: 10, metaTitle: null, originalUrl: 'https://notitle.com' });
      setupService({ links: [noTitleLink] });
      render(<InboxTriage />);

      // originalUrl appears as the title link
      const titleLink = screen.getByRole('link', { name: 'https://notitle.com' });
      expect(titleLink).toHaveAttribute('href', 'https://notitle.com');
    });

    it('shows title as link to original URL', () => {
      render(<InboxTriage />);

      const titleLink = screen.getByRole('link', { name: 'Inbox Link 1' });
      expect(titleLink).toHaveAttribute('href', 'https://example.com/1');
      expect(titleLink).toHaveAttribute('target', '_blank');
    });

    it('shows copy original URL button next to title', () => {
      render(<InboxTriage />);

      const copyButtons = screen.getAllByTitle('Copy original URL');
      expect(copyButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('shows meta description when present', () => {
      render(<InboxTriage />);

      expect(screen.getByText('A description')).toBeInTheDocument();
    });

    it('does not show description when null', () => {
      // inboxLink2 has metaDescription: null
      setupService({ links: [inboxLink2] });
      render(<InboxTriage />);

      expect(screen.queryByText('A description')).not.toBeInTheDocument();
    });

    it('shows favicon when present', () => {
      render(<InboxTriage />);

      const favicons = screen.getAllByAltText('favicon');
      expect(favicons.length).toBeGreaterThanOrEqual(1);
      expect(favicons[0]).toHaveAttribute('src', 'https://example.com/favicon.ico');
    });

    it('does not show favicon when null', () => {
      // inboxLink2 has metaFavicon: null
      setupService({ links: [inboxLink2] });
      render(<InboxTriage />);

      expect(screen.queryByAltText('favicon')).not.toBeInTheDocument();
    });
  });

  // ── Only shows uncategorized links ──

  describe('filtering', () => {
    it('only shows links with folderId === null', () => {
      render(<InboxTriage />);

      expect(screen.getByText('Inbox Link 1')).toBeInTheDocument();
      expect(screen.getByText('Inbox Link 2')).toBeInTheDocument();
      expect(screen.queryByText('Categorized Link')).not.toBeInTheDocument();
    });
  });

  // ── Folder selector ──

  describe('folder selector', () => {
    it('renders a select element for each inbox link', () => {
      render(<InboxTriage />);

      const selects = screen.getAllByRole('combobox');
      expect(selects).toHaveLength(2);
    });

    it('shows Inbox as default option', () => {
      render(<InboxTriage />);

      const selects = screen.getAllByRole('combobox');
      expect(selects[0]).toHaveValue('');
      expect(within(selects[0]).getByText('Inbox')).toBeInTheDocument();
    });

    it('shows folder options in select', () => {
      render(<InboxTriage />);

      const selects = screen.getAllByRole('combobox');
      expect(within(selects[0]).getByText('Work')).toBeInTheDocument();
      expect(within(selects[0]).getByText('Personal')).toBeInTheDocument();
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
      const user = userEvent.setup();
      render(<InboxTriage />);

      const inputs = screen.getAllByPlaceholderText('添加备注...');
      await user.type(inputs[0], 'my note');

      expect(inputs[0]).toHaveValue('my note');
    });
  });

  // ── Screenshot URL input ──

  describe('screenshot URL input', () => {
    it('shows screenshot URL input with placeholder', () => {
      render(<InboxTriage />);

      const inputs = screen.getAllByPlaceholderText('https://...');
      expect(inputs.length).toBeGreaterThanOrEqual(1);
    });

    it('shows screenshot URL label', () => {
      render(<InboxTriage />);

      const labels = screen.getAllByText('截图链接');
      expect(labels.length).toBeGreaterThanOrEqual(1);
    });

    it('allows typing into screenshot URL input', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const inputs = screen.getAllByPlaceholderText('https://...');
      await user.type(inputs[0], 'https://img.example.com/shot.png');

      expect(inputs[0]).toHaveValue('https://img.example.com/shot.png');
    });

    it('pre-fills screenshot URL from existing link data', () => {
      const linkWithScreenshot = makeLink({
        id: 10,
        screenshotUrl: 'https://img.example.com/existing.png',
      });
      setupService({ links: [linkWithScreenshot] });
      render(<InboxTriage />);

      const inputs = screen.getAllByPlaceholderText('https://...');
      expect(inputs[0]).toHaveValue('https://img.example.com/existing.png');
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
    it('shows assigned tags', () => {
      const linkTags: LinkTag[] = [
        { linkId: 1, tagId: 't1' },
      ];
      setupService({ linkTags });
      render(<InboxTriage />);

      expect(screen.getByText('Important')).toBeInTheDocument();
    });

    it('shows remove button for each assigned tag', () => {
      const linkTags: LinkTag[] = [
        { linkId: 1, tagId: 't1' },
        { linkId: 1, tagId: 't2' },
      ];
      setupService({ linkTags });
      render(<InboxTriage />);

      expect(screen.getByLabelText('Remove tag Important')).toBeInTheDocument();
      expect(screen.getByLabelText('Remove tag Read Later')).toBeInTheDocument();
    });

    it('shows add tag button', () => {
      render(<InboxTriage />);

      const addButtons = screen.getAllByLabelText('Add tag');
      expect(addButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('does not show tags for categorized links', () => {
      const linkTags: LinkTag[] = [
        { linkId: 3, tagId: 't1' }, // categorizedLink has id: 3
      ];
      setupService({ linkTags });
      render(<InboxTriage />);

      // Tag is assigned to categorized link only, which shouldn't render
      expect(screen.queryByText('Important')).not.toBeInTheDocument();
    });
  });

  // ── Delete button ──

  describe('delete button', () => {
    it('shows delete button with correct aria-label', () => {
      render(<InboxTriage />);

      const deleteButtons = screen.getAllByLabelText('Delete link');
      expect(deleteButtons).toHaveLength(2);
    });

    it('opens confirmation dialog when clicked', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const deleteButtons = screen.getAllByLabelText('Delete link');
      await user.click(deleteButtons[0]);

      expect(screen.getByText('确认删除')).toBeInTheDocument();
      expect(screen.getByText('此操作不可撤销，确定要删除这条链接吗？')).toBeInTheDocument();
    });

    it('shows cancel and confirm buttons in dialog', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const deleteButtons = screen.getAllByLabelText('Delete link');
      await user.click(deleteButtons[0]);

      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    });
  });

  // ── External link ──

  describe('external link', () => {
    it('renders external links that open in new tab', () => {
      render(<InboxTriage />);

      const externalLinks = screen.getAllByTitle('打开链接');
      expect(externalLinks.length).toBeGreaterThanOrEqual(1);
      expect(externalLinks[0]).toHaveAttribute('target', '_blank');
      expect(externalLinks[0]).toHaveAttribute('rel', 'noopener noreferrer');
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
      const user = userEvent.setup();
      render(<InboxTriage />);

      await user.click(screen.getByRole('button', { name: '刷新链接' }));

      expect(mockService.refreshLinks).toHaveBeenCalledTimes(1);
    });

    it('disables button while refreshing', async () => {
      // Make refreshLinks block so we can inspect the disabled state
      let resolveRefresh!: () => void;
      (mockService.refreshLinks as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise<void>((r) => { resolveRefresh = r; }),
      );

      const user = userEvent.setup();
      render(<InboxTriage />);

      const btn = screen.getByRole('button', { name: '刷新链接' });
      await user.click(btn);

      // Button should be disabled while refreshing
      expect(btn).toBeDisabled();

      // Resolve the promise and wait for state update
      resolveRefresh();
      await vi.waitFor(() => {
        expect(btn).not.toBeDisabled();
      });
    });
  });

  // ── Copy original URL ──

  describe('copy original URL', () => {
    it('calls copyToClipboard with original URL when copy button is clicked', async () => {
      const { copyToClipboard } = await import('@/lib/utils');
      const user = userEvent.setup();
      render(<InboxTriage />);

      const copyButtons = screen.getAllByTitle('Copy original URL');
      await user.click(copyButtons[0]);

      expect(copyToClipboard).toHaveBeenCalledWith('https://example.com/1');
    });

    it('shows check icon temporarily after successful copy', async () => {
      const { copyToClipboard } = await import('@/lib/utils');
      (copyToClipboard as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const user = userEvent.setup();
      render(<InboxTriage />);

      const copyButtons = screen.getAllByTitle('Copy original URL');
      await user.click(copyButtons[0]);

      // Check icon should appear (has class text-success)
      const checkIcon = copyButtons[0].querySelector('.text-success');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  // ── Folder selector onChange ──

  describe('folder selector onChange', () => {
    it('updates folder selection when a folder is chosen', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const selects = screen.getAllByRole('combobox');
      await user.selectOptions(selects[0], 'f1');

      expect(selects[0]).toHaveValue('f1');
    });

    it('resets to Inbox when empty option is selected', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const selects = screen.getAllByRole('combobox');
      // Select a folder first
      await user.selectOptions(selects[0], 'f1');
      expect(selects[0]).toHaveValue('f1');

      // Reset to Inbox
      await user.selectOptions(selects[0], '');
      expect(selects[0]).toHaveValue('');
    });
  });

  // ── Note input onChange ──

  describe('note input onChange', () => {
    it('updates note value as user types', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const inputs = screen.getAllByPlaceholderText('添加备注...');
      await user.type(inputs[0], 'hello world');

      expect(inputs[0]).toHaveValue('hello world');
    });
  });

  // ── Screenshot URL input onChange ──

  describe('screenshot URL input onChange', () => {
    it('updates screenshot URL value as user types', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const inputs = screen.getAllByPlaceholderText('https://...');
      await user.type(inputs[0], 'https://screenshot.example.com/img.png');

      expect(inputs[0]).toHaveValue('https://screenshot.example.com/img.png');
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
      await user.click(saveButtons[0]);

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
      await user.click(addButtons[0]);

      expect(screen.getByPlaceholderText('搜索或创建标签...')).toBeInTheDocument();
    });

    it('selects an existing tag from picker', async () => {
      const { addTagToLink } = await import('@/actions/tags');
      (addTagToLink as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      const user = userEvent.setup();
      render(<InboxTriage />);

      // Open the tag picker for the first inbox link
      const addButtons = screen.getAllByLabelText('Add tag');
      await user.click(addButtons[0]);

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
        data: { id: 't-new', userId: 'u1', name: 'NewTag', color: 'gray', createdAt: new Date() },
      });

      const { addTagToLink } = await import('@/actions/tags');
      (addTagToLink as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      const user = userEvent.setup();
      render(<InboxTriage />);

      const addButtons = screen.getAllByLabelText('Add tag');
      await user.click(addButtons[0]);

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
      await user.click(deleteButtons[0]);

      // Click confirm
      const confirmBtn = screen.getByRole('button', { name: '删除' });
      await user.click(confirmBtn);

      expect(deleteLink).toHaveBeenCalledWith(1);
      await vi.waitFor(() => {
        expect(mockService.handleLinkDeleted).toHaveBeenCalledWith(1);
      });
    });

    it('shows alert on delete failure', async () => {
      const { deleteLink } = await import('@/actions/links');
      (deleteLink as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: 'Delete failed' });

      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      const user = userEvent.setup();
      render(<InboxTriage />);

      const deleteButtons = screen.getAllByLabelText('Delete link');
      await user.click(deleteButtons[0]);

      const confirmBtn = screen.getByRole('button', { name: '删除' });
      await user.click(confirmBtn);

      await vi.waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Delete failed');
      });

      alertSpy.mockRestore();
    });

    it('closes dialog on cancel', async () => {
      const user = userEvent.setup();
      render(<InboxTriage />);

      const deleteButtons = screen.getAllByLabelText('Delete link');
      await user.click(deleteButtons[0]);

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
});
