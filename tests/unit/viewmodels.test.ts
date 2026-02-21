import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Link, AnalyticsStats } from '@/models/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockToast = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/actions/links', () => ({
  getLinks: vi.fn(),
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  updateLink: vi.fn(),
  updateLinkNote: vi.fn(),
  getAnalyticsStats: vi.fn(),
  refreshLinkMetadata: vi.fn(),
  fetchAndSaveScreenshot: vi.fn(),
}));

vi.mock('@/actions/folders', () => ({
  getFolders: vi.fn(),
}));

vi.mock('@/actions/tags', () => ({
  createTag: vi.fn(),
  addTagToLink: vi.fn(),
  removeTagFromLink: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  copyToClipboard: vi.fn(),
  cn: (...inputs: string[]) => inputs.join(' '),
  formatDate: (d: Date) => d.toISOString(),
  formatNumber: (n: number) => String(n),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

let mockIsMobile = false;
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

// Import after mocks are defined
import {
  useLinkCardViewModel,
  useCreateLinkViewModel,
} from '@/viewmodels/useLinksViewModel';
import { useDashboardLayoutViewModel } from '@/viewmodels/useDashboardLayoutViewModel';
import { createLink, deleteLink, getAnalyticsStats, refreshLinkMetadata, fetchAndSaveScreenshot } from '@/actions/links';
import { copyToClipboard } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 1,
    userId: 'user-1',
    folderId: null,
    originalUrl: 'https://example.com',
    slug: 'abc123',
    isCustom: false,
    expiresAt: null,
    clicks: 0,
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
    screenshotUrl: null,
    note: null,
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

const SITE_URL = 'https://zhe.to';

// ---------------------------------------------------------------------------
// useLinkCardViewModel
// ---------------------------------------------------------------------------

describe('useLinkCardViewModel', () => {
  const mockOnDelete = vi.fn();
  const mockOnUpdate = vi.fn();
  // Link with metadata populated — avoids triggering auto-fetch useEffect
  const link = makeLink({ id: 42, slug: 'my-link', metaTitle: 'Example', metaFavicon: 'https://example.com/icon.png' });

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnDelete.mockClear();
    mockOnUpdate.mockClear();
    mockToast.info.mockClear();
    mockToast.success.mockClear();
    mockToast.error.mockClear();
    vi.mocked(copyToClipboard).mockReset();
    vi.mocked(deleteLink).mockReset();
    vi.mocked(getAnalyticsStats).mockReset();
    vi.mocked(refreshLinkMetadata).mockReset();
    vi.mocked(fetchAndSaveScreenshot).mockReset();
    // Default: auto-fetch metadata resolves with no-op (link has no metadata)
    vi.mocked(refreshLinkMetadata).mockResolvedValue({ success: true, data: link });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('computes shortUrl from siteUrl and slug', () => {
    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    expect(result.current.shortUrl).toBe('https://zhe.to/my-link');
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    expect(result.current.copied).toBe(false);
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.showAnalytics).toBe(false);
    expect(result.current.analyticsStats).toBeNull();
    expect(result.current.isLoadingAnalytics).toBe(false);
  });

  // --- handleCopy ---

  it('handleCopy calls copyToClipboard, sets copied=true, then false after 2s', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(copyToClipboard).toHaveBeenCalledWith('https://zhe.to/my-link');
    expect(result.current.copied).toBe(true);

    // Advance 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.copied).toBe(false);
  });

  it('handleCopy does not set copied when copyToClipboard fails', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(false);

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(result.current.copied).toBe(false);
  });

  // --- handleDelete ---
  // Note: confirmation is now handled by AlertDialog in the component layer.
  // handleDelete is called directly after user confirms via AlertDialog.

  it('handleDelete calls deleteLink and onDelete on success', async () => {
    vi.mocked(deleteLink).mockResolvedValue({ success: true });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(deleteLink).toHaveBeenCalledWith(42);
    expect(mockOnDelete).toHaveBeenCalledWith(42);
    expect(result.current.isDeleting).toBe(false);
  });

  it('handleDelete shows toast on failure', async () => {
    vi.mocked(deleteLink).mockResolvedValue({
      success: false,
      error: 'Not found',
    });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockOnDelete).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith('删除失败', { description: 'Not found' });
    expect(result.current.isDeleting).toBe(false);
  });

  it('handleDelete shows default error message when error is empty', async () => {
    vi.mocked(deleteLink).mockResolvedValue({ success: false });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockToast.error).toHaveBeenCalledWith('删除失败', { description: 'Failed to delete link' });
  });

  // --- handleToggleAnalytics ---

  it('handleToggleAnalytics opens and lazy-loads analytics', async () => {
    const stats: AnalyticsStats = {
      totalClicks: 100,
      uniqueCountries: ['US', 'DE'],
      deviceBreakdown: { desktop: 80, mobile: 20 },
      browserBreakdown: { Chrome: 60, Firefox: 40 },
      osBreakdown: { Windows: 50, macOS: 50 },
    };
    vi.mocked(getAnalyticsStats).mockResolvedValue({
      success: true,
      data: stats,
    });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    expect(result.current.showAnalytics).toBe(false);

    await act(async () => {
      await result.current.handleToggleAnalytics();
    });

    expect(result.current.showAnalytics).toBe(true);
    expect(getAnalyticsStats).toHaveBeenCalledWith(42);
    expect(result.current.analyticsStats).toEqual(stats);
    expect(result.current.isLoadingAnalytics).toBe(false);
  });

  it('handleToggleAnalytics does not re-fetch if already loaded', async () => {
    const stats: AnalyticsStats = {
      totalClicks: 50,
      uniqueCountries: ['JP'],
      deviceBreakdown: { mobile: 50 },
      browserBreakdown: { Safari: 50 },
      osBreakdown: { iOS: 50 },
    };
    vi.mocked(getAnalyticsStats).mockResolvedValue({
      success: true,
      data: stats,
    });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    // First toggle: open + fetch
    await act(async () => {
      await result.current.handleToggleAnalytics();
    });

    expect(getAnalyticsStats).toHaveBeenCalledTimes(1);
    expect(result.current.showAnalytics).toBe(true);
    expect(result.current.analyticsStats).toEqual(stats);

    // Second toggle: close
    await act(async () => {
      await result.current.handleToggleAnalytics();
    });

    expect(result.current.showAnalytics).toBe(false);

    // Third toggle: re-open — should NOT re-fetch
    await act(async () => {
      await result.current.handleToggleAnalytics();
    });

    expect(result.current.showAnalytics).toBe(true);
    expect(getAnalyticsStats).toHaveBeenCalledTimes(1); // still 1
  });

  it('handleToggleAnalytics handles fetch failure gracefully', async () => {
    vi.mocked(getAnalyticsStats).mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {
      await result.current.handleToggleAnalytics();
    });

    expect(result.current.showAnalytics).toBe(true);
    expect(result.current.analyticsStats).toBeNull();
    expect(result.current.isLoadingAnalytics).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // --- handleRefreshMetadata ---

  it('auto-fetches metadata when all metadata fields are null', async () => {
    const noMetaLink = makeLink({ id: 42, slug: 'my-link', metaTitle: null, metaDescription: null, metaFavicon: null });
    const updatedLink = { ...noMetaLink, metaTitle: 'Fetched Title', metaFavicon: 'https://example.com/icon.png' };
    vi.mocked(refreshLinkMetadata).mockResolvedValue({ success: true, data: updatedLink });

    renderHook(() =>
      useLinkCardViewModel(noMetaLink, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    // Flush the auto-fetch useEffect
    await act(async () => {});

    expect(refreshLinkMetadata).toHaveBeenCalledWith(42);
    expect(mockOnUpdate).toHaveBeenCalledWith(updatedLink);
  });

  it('does not auto-fetch metadata when metaTitle is present', async () => {
    vi.mocked(refreshLinkMetadata).mockClear();

    renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {});

    expect(refreshLinkMetadata).not.toHaveBeenCalled();
  });

  it('does not auto-fetch metadata when only metaFavicon is present', async () => {
    vi.mocked(refreshLinkMetadata).mockClear();
    const faviconOnlyLink = makeLink({ id: 42, slug: 'my-link', metaTitle: null, metaDescription: null, metaFavicon: 'https://example.com/icon.png' });

    renderHook(() =>
      useLinkCardViewModel(faviconOnlyLink, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {});

    expect(refreshLinkMetadata).not.toHaveBeenCalled();
  });

  it('does not auto-fetch metadata when link has a user note', async () => {
    vi.mocked(refreshLinkMetadata).mockClear();
    const noteLink = makeLink({ id: 42, slug: 'my-link', metaTitle: null, metaDescription: null, metaFavicon: null, note: 'My personal note' });

    renderHook(() =>
      useLinkCardViewModel(noteLink, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {});

    expect(refreshLinkMetadata).not.toHaveBeenCalled();
  });

  it('auto-fetch metadata handles failure gracefully', async () => {
    const noMetaLink = makeLink({ id: 42, slug: 'my-link', metaTitle: null, metaDescription: null, metaFavicon: null });
    vi.mocked(refreshLinkMetadata).mockResolvedValue({ success: false, error: 'Failed' });

    const { result } = renderHook(() =>
      useLinkCardViewModel(noMetaLink, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {});

    expect(refreshLinkMetadata).toHaveBeenCalledWith(42);
    expect(mockOnUpdate).not.toHaveBeenCalled();
    expect(result.current.isRefreshingMetadata).toBe(false);
  });

  it('handleRefreshMetadata calls refreshLinkMetadata and onUpdate on success', async () => {
    const updatedLink = {
      ...link,
      metaTitle: 'Example Title',
      metaDescription: 'A description',
      metaFavicon: 'https://example.com/favicon.ico',
    };
    vi.mocked(refreshLinkMetadata).mockResolvedValue({ success: true, data: updatedLink });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    expect(result.current.isRefreshingMetadata).toBe(false);

    await act(async () => {
      await result.current.handleRefreshMetadata();
    });

    expect(refreshLinkMetadata).toHaveBeenCalledWith(42);
    expect(mockOnUpdate).toHaveBeenCalledWith(updatedLink);
    expect(mockToast.success).toHaveBeenCalledWith('元数据已刷新');
    expect(result.current.isRefreshingMetadata).toBe(false);
  });

  it('handleRefreshMetadata shows toast on failure', async () => {
    vi.mocked(refreshLinkMetadata).mockResolvedValue({
      success: false,
      error: 'Failed to refresh metadata',
    });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {
      await result.current.handleRefreshMetadata();
    });

    expect(mockToast.error).toHaveBeenCalledWith('刷新元数据失败', { description: 'Failed to refresh metadata' });
    expect(mockOnUpdate).not.toHaveBeenCalled();
    expect(result.current.isRefreshingMetadata).toBe(false);
  });

  it('handleRefreshMetadata shows default error when error is empty', async () => {
    vi.mocked(refreshLinkMetadata).mockResolvedValue({ success: false });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {
      await result.current.handleRefreshMetadata();
    });

    expect(mockToast.error).toHaveBeenCalledWith('刷新元数据失败', { description: 'Failed to refresh metadata' });
  });

  it('handleRefreshMetadata handles thrown errors gracefully', async () => {
    vi.mocked(refreshLinkMetadata).mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {
      await result.current.handleRefreshMetadata();
    });

    expect(result.current.isRefreshingMetadata).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // --- handleFetchPreview ---

  it('handleFetchPreview with microlink source calls server action and updates', async () => {
    const updatedLink = { ...link, screenshotUrl: 'https://r2.example.com/img.png' };
    vi.mocked(fetchAndSaveScreenshot).mockResolvedValue({ success: true, data: updatedLink });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    // Flush auto-fetch metadata effect
    await act(async () => {});
    mockToast.info.mockClear();

    await act(async () => {
      await result.current.handleFetchPreview('microlink');
    });

    expect(mockToast.info).toHaveBeenCalledWith('正在抓取预览图...', { description: '来源: Microlink' });
    expect(fetchAndSaveScreenshot).toHaveBeenCalledWith(42, 'https://example.com', 'microlink');
    expect(mockOnUpdate).toHaveBeenCalledWith(updatedLink);
    expect(mockToast.success).toHaveBeenCalledWith('预览图已更新');
    expect(result.current.isFetchingPreview).toBe(false);
  });

  it('handleFetchPreview with screenshotDomains source calls server action and updates', async () => {
    const updatedLink = { ...link, screenshotUrl: 'https://r2.example.com/img.png' };
    vi.mocked(fetchAndSaveScreenshot).mockResolvedValue({ success: true, data: updatedLink });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {});
    mockToast.info.mockClear();

    await act(async () => {
      await result.current.handleFetchPreview('screenshotDomains');
    });

    expect(mockToast.info).toHaveBeenCalledWith('正在抓取预览图...', { description: '来源: Screenshot Domains' });
    expect(fetchAndSaveScreenshot).toHaveBeenCalledWith(42, 'https://example.com', 'screenshotDomains');
    expect(mockOnUpdate).toHaveBeenCalledWith(updatedLink);
    expect(mockToast.success).toHaveBeenCalledWith('预览图已更新');
    expect(result.current.isFetchingPreview).toBe(false);
  });

  it('handleFetchPreview shows toast when server action returns error', async () => {
    vi.mocked(fetchAndSaveScreenshot).mockResolvedValue({
      success: false,
      error: 'Microlink did not return a valid screenshot',
    });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {});
    mockToast.error.mockClear();

    await act(async () => {
      await result.current.handleFetchPreview('microlink');
    });

    expect(mockToast.error).toHaveBeenCalledWith('抓取预览图失败', {
      description: 'Microlink did not return a valid screenshot',
    });
    expect(mockOnUpdate).not.toHaveBeenCalled();
    expect(result.current.isFetchingPreview).toBe(false);
  });

  it('handleFetchPreview shows toast when server action fails with upload error', async () => {
    vi.mocked(fetchAndSaveScreenshot).mockResolvedValue({ success: false, error: 'Upload failed' });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {});
    mockToast.error.mockClear();

    await act(async () => {
      await result.current.handleFetchPreview('microlink');
    });

    expect(mockToast.error).toHaveBeenCalledWith('抓取预览图失败', { description: 'Upload failed' });
    expect(mockOnUpdate).not.toHaveBeenCalled();
    expect(result.current.isFetchingPreview).toBe(false);
  });

  // --- favicon / screenshot display logic ---

  it('returns faviconUrl when no screenshotUrl exists', () => {
    const noScreenshotLink = makeLink({ id: 42, slug: 'my-link', metaTitle: 'Example', screenshotUrl: null });

    const { result } = renderHook(() =>
      useLinkCardViewModel(noScreenshotLink, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    expect(result.current.faviconUrl).toBe('https://favicon.im/example.com?larger=true');
    expect(result.current.screenshotUrl).toBeNull();
  });

  it('returns faviconUrl=null when screenshotUrl exists', () => {
    const linkWithScreenshot = makeLink({ id: 42, slug: 'my-link', metaTitle: 'Example', screenshotUrl: 'https://r2.example.com/shot.png' });

    const { result } = renderHook(() =>
      useLinkCardViewModel(linkWithScreenshot, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    expect(result.current.faviconUrl).toBeNull();
    expect(result.current.screenshotUrl).toBe('https://r2.example.com/shot.png');
  });

  it('does not auto-fetch screenshot on mount', async () => {
    renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    await act(async () => {});

    // Screenshot fetch is now a server action — it should NOT be called on mount
    expect(fetchAndSaveScreenshot).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useCreateLinkViewModel
// ---------------------------------------------------------------------------

describe('useCreateLinkViewModel', () => {
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    mockOnSuccess.mockClear();
    vi.mocked(createLink).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() =>
      useCreateLinkViewModel(SITE_URL, mockOnSuccess)
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.mode).toBe('simple');
    expect(result.current.url).toBe('');
    expect(result.current.customSlug).toBe('');
    expect(result.current.folderId).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.siteUrl).toBe(SITE_URL);
  });

  it('handleSubmit with success resets form and calls onSuccess', async () => {
    const createdLink = makeLink({ id: 77, slug: 'new-slug' });
    vi.mocked(createLink).mockResolvedValue({
      success: true,
      data: createdLink,
    });

    const { result } = renderHook(() =>
      useCreateLinkViewModel(SITE_URL, mockOnSuccess)
    );

    // Fill form
    act(() => {
      result.current.setUrl('https://example.com/long-url');
      result.current.setCustomSlug('my-slug');
      result.current.setMode('custom');
      result.current.setIsOpen(true);
    });

    expect(result.current.url).toBe('https://example.com/long-url');
    expect(result.current.customSlug).toBe('my-slug');
    expect(result.current.mode).toBe('custom');
    expect(result.current.isOpen).toBe(true);

    // Submit
    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(fakeEvent);
    });

    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(createLink).toHaveBeenCalledWith({
      originalUrl: 'https://example.com/long-url',
      customSlug: 'my-slug',
      folderId: undefined,
    });
    expect(mockOnSuccess).toHaveBeenCalledWith(createdLink);

    // Form should be reset
    expect(result.current.url).toBe('');
    expect(result.current.customSlug).toBe('');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('handleSubmit in simple mode does not send customSlug', async () => {
    vi.mocked(createLink).mockResolvedValue({
      success: true,
      data: makeLink(),
    });

    const { result } = renderHook(() =>
      useCreateLinkViewModel(SITE_URL, mockOnSuccess)
    );

    act(() => {
      result.current.setUrl('https://example.com');
      // mode stays "simple" (default)
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(fakeEvent);
    });

    expect(createLink).toHaveBeenCalledWith({
      originalUrl: 'https://example.com',
      customSlug: undefined,
      folderId: undefined,
    });
  });

  it('handleSubmit with error sets error message', async () => {
    vi.mocked(createLink).mockResolvedValue({
      success: false,
      error: 'Slug already taken',
    });

    const { result } = renderHook(() =>
      useCreateLinkViewModel(SITE_URL, mockOnSuccess)
    );

    act(() => {
      result.current.setUrl('https://example.com');
      result.current.setMode('custom');
      result.current.setCustomSlug('taken-slug');
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(fakeEvent);
    });

    expect(result.current.error).toBe('Slug already taken');
    expect(result.current.isLoading).toBe(false);
    expect(mockOnSuccess).not.toHaveBeenCalled();
    // Form should NOT be reset on error
    expect(result.current.url).toBe('https://example.com');
    expect(result.current.isOpen).toBe(false); // isOpen was never set to true
  });

  it('handleSubmit with error uses default message when error is empty', async () => {
    vi.mocked(createLink).mockResolvedValue({ success: false });

    const { result } = renderHook(() =>
      useCreateLinkViewModel(SITE_URL, mockOnSuccess)
    );

    act(() => {
      result.current.setUrl('https://example.com');
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(fakeEvent);
    });

    expect(result.current.error).toBe('Failed to create link');
  });

  it('handleSubmit clears previous error before submitting', async () => {
    // First call fails
    vi.mocked(createLink).mockResolvedValueOnce({
      success: false,
      error: 'First error',
    });

    const { result } = renderHook(() =>
      useCreateLinkViewModel(SITE_URL, mockOnSuccess)
    );

    act(() => {
      result.current.setUrl('https://example.com');
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(fakeEvent);
    });

    expect(result.current.error).toBe('First error');

    // Second call succeeds
    vi.mocked(createLink).mockResolvedValueOnce({
      success: true,
      data: makeLink(),
    });

    await act(async () => {
      await result.current.handleSubmit(fakeEvent);
    });

    expect(result.current.error).toBe('');
  });

  it('handleSubmit passes folderId to createLink', async () => {
    vi.mocked(createLink).mockResolvedValue({
      success: true,
      data: makeLink({ folderId: 'folder-123' }),
    });

    const { result } = renderHook(() =>
      useCreateLinkViewModel(SITE_URL, mockOnSuccess)
    );

    act(() => {
      result.current.setUrl('https://example.com');
      result.current.setFolderId('folder-123');
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(fakeEvent);
    });

    expect(createLink).toHaveBeenCalledWith({
      originalUrl: 'https://example.com',
      customSlug: undefined,
      folderId: 'folder-123',
    });
  });

  it('handleSubmit resets folderId on success', async () => {
    vi.mocked(createLink).mockResolvedValue({
      success: true,
      data: makeLink(),
    });

    const { result } = renderHook(() =>
      useCreateLinkViewModel(SITE_URL, mockOnSuccess)
    );

    act(() => {
      result.current.setUrl('https://example.com');
      result.current.setFolderId('folder-123');
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

    await act(async () => {
      await result.current.handleSubmit(fakeEvent);
    });

    expect(result.current.folderId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useDashboardLayoutViewModel
// ---------------------------------------------------------------------------

describe('useDashboardLayoutViewModel', () => {
  beforeEach(() => {
    mockIsMobile = false;
    document.body.style.overflow = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = '';
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useDashboardLayoutViewModel());

    expect(result.current.collapsed).toBe(false);
    expect(result.current.mobileOpen).toBe(false);
  });

  it('toggleSidebar on desktop toggles collapsed', () => {
    mockIsMobile = false;
    const { result } = renderHook(() => useDashboardLayoutViewModel());

    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.collapsed).toBe(true);
    expect(result.current.mobileOpen).toBe(false);

    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.collapsed).toBe(false);
  });

  it('toggleSidebar on mobile toggles mobileOpen', () => {
    mockIsMobile = true;
    const { result } = renderHook(() => useDashboardLayoutViewModel());

    expect(result.current.mobileOpen).toBe(false);

    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.mobileOpen).toBe(true);
    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.mobileOpen).toBe(false);
  });

  it('closeMobileSidebar sets mobileOpen to false', () => {
    mockIsMobile = true;
    const { result } = renderHook(() => useDashboardLayoutViewModel());

    // Open first
    act(() => {
      result.current.toggleSidebar();
    });
    expect(result.current.mobileOpen).toBe(true);

    act(() => {
      result.current.closeMobileSidebar();
    });
    expect(result.current.mobileOpen).toBe(false);
  });

  it('closeMobileSidebar is safe to call when already closed', () => {
    const { result } = renderHook(() => useDashboardLayoutViewModel());

    expect(result.current.mobileOpen).toBe(false);

    act(() => {
      result.current.closeMobileSidebar();
    });

    expect(result.current.mobileOpen).toBe(false);
  });

  it('locks body scroll when mobileOpen=true', () => {
    mockIsMobile = true;
    const { result } = renderHook(() => useDashboardLayoutViewModel());

    expect(document.body.style.overflow).toBe('');

    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.mobileOpen).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('unlocks body scroll when mobileOpen=false', () => {
    mockIsMobile = true;
    const { result } = renderHook(() => useDashboardLayoutViewModel());

    // Open
    act(() => {
      result.current.toggleSidebar();
    });
    expect(document.body.style.overflow).toBe('hidden');

    // Close
    act(() => {
      result.current.toggleSidebar();
    });
    expect(document.body.style.overflow).toBe('');
  });

  it('restores body scroll on unmount', () => {
    mockIsMobile = true;
    const { result, unmount } = renderHook(() => useDashboardLayoutViewModel());

    act(() => {
      result.current.toggleSidebar();
    });
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
  });
});
