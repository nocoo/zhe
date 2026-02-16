import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Link, AnalyticsStats } from '@/models/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/actions/links', () => ({
  getLinks: vi.fn(),
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  updateLink: vi.fn(),
  getAnalyticsStats: vi.fn(),
  refreshLinkMetadata: vi.fn(),
}));

vi.mock('@/actions/folders', () => ({
  getFolders: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  copyToClipboard: vi.fn(),
  cn: (...inputs: string[]) => inputs.join(' '),
  formatDate: (d: Date) => d.toISOString(),
  formatNumber: (n: number) => String(n),
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
import { createLink, deleteLink, updateLink, getAnalyticsStats, refreshLinkMetadata } from '@/actions/links';
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
  const link = makeLink({ id: 42, slug: 'my-link' });

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnDelete.mockClear();
    mockOnUpdate.mockClear();
    vi.mocked(copyToClipboard).mockReset();
    vi.mocked(deleteLink).mockReset();
    vi.mocked(updateLink).mockReset();
    vi.mocked(getAnalyticsStats).mockReset();
    // Mock window.alert (confirm no longer used — AlertDialog handles confirmation)
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('handleDelete shows alert on failure', async () => {
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
    expect(globalThis.alert).toHaveBeenCalledWith('Not found');
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

    expect(globalThis.alert).toHaveBeenCalledWith('Failed to delete link');
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

  // --- handleEdit (enter/save/cancel editing) ---

  it('returns isEditing=false and editUrl="" initially', () => {
    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    expect(result.current.isEditing).toBe(false);
    expect(result.current.editUrl).toBe('');
    expect(result.current.editFolderId).toBeUndefined();
    expect(result.current.isSaving).toBe(false);
  });

  it('startEditing sets isEditing=true and populates editUrl from link', () => {
    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    act(() => {
      result.current.startEditing();
    });

    expect(result.current.isEditing).toBe(true);
    expect(result.current.editUrl).toBe(link.originalUrl);
    expect(result.current.editFolderId).toBe(link.folderId ?? undefined);
  });

  it('cancelEditing resets editing state', () => {
    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    act(() => {
      result.current.startEditing();
    });
    expect(result.current.isEditing).toBe(true);

    act(() => {
      result.current.cancelEditing();
    });
    expect(result.current.isEditing).toBe(false);
    expect(result.current.editUrl).toBe('');
  });

  it('saveEdit calls updateLink and onUpdate on success', async () => {
    const updatedLink = { ...link, originalUrl: 'https://updated.com' };
    vi.mocked(updateLink).mockResolvedValue({ success: true, data: updatedLink });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    act(() => {
      result.current.startEditing();
    });

    act(() => {
      result.current.setEditUrl('https://updated.com');
    });

    await act(async () => {
      await result.current.saveEdit();
    });

    expect(updateLink).toHaveBeenCalledWith(42, {
      originalUrl: 'https://updated.com',
      folderId: undefined,
    });
    expect(mockOnUpdate).toHaveBeenCalledWith(updatedLink);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it('saveEdit shows alert on failure', async () => {
    vi.mocked(updateLink).mockResolvedValue({ success: false, error: 'Invalid URL' });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    act(() => {
      result.current.startEditing();
      result.current.setEditUrl('bad');
    });

    await act(async () => {
      await result.current.saveEdit();
    });

    expect(globalThis.alert).toHaveBeenCalledWith('Invalid URL');
    expect(result.current.isEditing).toBe(true); // stays in edit mode
    expect(result.current.isSaving).toBe(false);
    expect(mockOnUpdate).not.toHaveBeenCalled();
  });

  it('saveEdit shows default error when error is empty', async () => {
    vi.mocked(updateLink).mockResolvedValue({ success: false });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    act(() => {
      result.current.startEditing();
    });

    await act(async () => {
      await result.current.saveEdit();
    });

    expect(globalThis.alert).toHaveBeenCalledWith('Failed to update link');
  });

  it('saveEdit sends folderId when changed', async () => {
    const updatedLink = { ...link, folderId: 'folder-99' };
    vi.mocked(updateLink).mockResolvedValue({ success: true, data: updatedLink });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete, mockOnUpdate)
    );

    act(() => {
      result.current.startEditing();
      result.current.setEditFolderId('folder-99');
    });

    await act(async () => {
      await result.current.saveEdit();
    });

    expect(updateLink).toHaveBeenCalledWith(42, {
      originalUrl: link.originalUrl,
      folderId: 'folder-99',
    });
    expect(mockOnUpdate).toHaveBeenCalledWith(updatedLink);
  });

  // --- handleRefreshMetadata ---

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
    expect(result.current.isRefreshingMetadata).toBe(false);
  });

  it('handleRefreshMetadata shows alert on failure', async () => {
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

    expect(globalThis.alert).toHaveBeenCalledWith('Failed to refresh metadata');
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

    expect(globalThis.alert).toHaveBeenCalledWith('Failed to refresh metadata');
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
