import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Link, AnalyticsStats } from '@/models/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/actions/links', () => ({
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  getAnalyticsStats: vi.fn(),
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
  useLinksViewModel,
  useLinkCardViewModel,
  useCreateLinkViewModel,
} from '@/viewmodels/useLinksViewModel';
import { useDashboardLayoutViewModel } from '@/viewmodels/useDashboardLayoutViewModel';
import { createLink, deleteLink, getAnalyticsStats } from '@/actions/links';
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
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

const SITE_URL = 'https://zhe.to';

// ---------------------------------------------------------------------------
// useLinksViewModel
// ---------------------------------------------------------------------------

describe('useLinksViewModel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial state with provided links and siteUrl', () => {
    const links = [makeLink({ id: 1 }), makeLink({ id: 2, slug: 'xyz' })];
    const { result } = renderHook(() => useLinksViewModel(links, SITE_URL));

    expect(result.current.links).toEqual(links);
    expect(result.current.isCreating).toBe(false);
    expect(result.current.siteUrl).toBe(SITE_URL);
  });

  it('handleLinkCreated prepends the new link to the front', () => {
    const existing = [makeLink({ id: 1 })];
    const { result } = renderHook(() => useLinksViewModel(existing, SITE_URL));

    const newLink = makeLink({ id: 99, slug: 'new-one' });

    act(() => {
      result.current.handleLinkCreated(newLink);
    });

    expect(result.current.links).toHaveLength(2);
    expect(result.current.links[0]).toEqual(newLink);
    expect(result.current.links[1]).toEqual(existing[0]);
  });

  it('handleLinkDeleted removes the link by id', () => {
    const links = [
      makeLink({ id: 1, slug: 'a' }),
      makeLink({ id: 2, slug: 'b' }),
      makeLink({ id: 3, slug: 'c' }),
    ];
    const { result } = renderHook(() => useLinksViewModel(links, SITE_URL));

    act(() => {
      result.current.handleLinkDeleted(2);
    });

    expect(result.current.links).toHaveLength(2);
    expect(result.current.links.map((l) => l.id)).toEqual([1, 3]);
  });

  it('handleLinkDeleted with non-existent id does nothing', () => {
    const links = [makeLink({ id: 1 })];
    const { result } = renderHook(() => useLinksViewModel(links, SITE_URL));

    act(() => {
      result.current.handleLinkDeleted(999);
    });

    expect(result.current.links).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// useLinkCardViewModel
// ---------------------------------------------------------------------------

describe('useLinkCardViewModel', () => {
  const mockOnDelete = vi.fn();
  const link = makeLink({ id: 42, slug: 'my-link' });

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnDelete.mockClear();
    vi.mocked(copyToClipboard).mockReset();
    vi.mocked(deleteLink).mockReset();
    vi.mocked(getAnalyticsStats).mockReset();
    // Mock window.confirm and window.alert
    vi.stubGlobal('confirm', vi.fn());
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('computes shortUrl from siteUrl and slug', () => {
    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
    );

    expect(result.current.shortUrl).toBe('https://zhe.to/my-link');
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
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
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
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
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
    );

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(result.current.copied).toBe(false);
  });

  // --- handleDelete ---

  it('handleDelete with confirm=true calls deleteLink and onDelete on success', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.mocked(deleteLink).mockResolvedValue({ success: true });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(globalThis.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete this link?'
    );
    expect(deleteLink).toHaveBeenCalledWith(42);
    expect(mockOnDelete).toHaveBeenCalledWith(42);
    expect(result.current.isDeleting).toBe(false);
  });

  it('handleDelete with confirm=true shows alert on failure', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.mocked(deleteLink).mockResolvedValue({
      success: false,
      error: 'Not found',
    });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockOnDelete).not.toHaveBeenCalled();
    expect(globalThis.alert).toHaveBeenCalledWith('Not found');
    expect(result.current.isDeleting).toBe(false);
  });

  it('handleDelete with confirm=true shows default error message when error is empty', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.mocked(deleteLink).mockResolvedValue({ success: false });

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(globalThis.alert).toHaveBeenCalledWith('Failed to delete link');
  });

  it('handleDelete with confirm=false does nothing', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { result } = renderHook(() =>
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(deleteLink).not.toHaveBeenCalled();
    expect(mockOnDelete).not.toHaveBeenCalled();
    expect(result.current.isDeleting).toBe(false);
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
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
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
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
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
      useLinkCardViewModel(link, SITE_URL, mockOnDelete)
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
