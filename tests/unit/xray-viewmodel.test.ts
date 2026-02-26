import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetXrayConfig = vi.fn();
const mockSaveXrayConfig = vi.fn();
const mockFetchTweet = vi.fn();
const mockFetchBookmarks = vi.fn();

vi.mock('@/actions/xray', () => ({
  getXrayConfig: (...args: unknown[]) => mockGetXrayConfig(...args),
  saveXrayConfig: (...args: unknown[]) => mockSaveXrayConfig(...args),
  fetchTweet: (...args: unknown[]) => mockFetchTweet(...args),
  fetchBookmarks: (...args: unknown[]) => mockFetchBookmarks(...args),
}));

const mockCreateLink = vi.fn();

vi.mock('@/actions/links', () => ({
  createLink: (...args: unknown[]) => mockCreateLink(...args),
}));

import { useXrayViewModel } from '@/viewmodels/useXrayViewModel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAVED_CONFIG = {
  success: true,
  data: {
    apiUrl: 'https://xray.hexly.ai',
    maskedToken: 'abcd••••qrst',
  },
};

const MOCK_TWEET_RESPONSE = {
  success: true,
  data: {
    id: '123',
    text: 'Hello world',
    author: {
      id: '1',
      username: 'testuser',
      name: 'Test User',
      profile_image_url: 'https://example.com/avatar.jpg',
      followers_count: 100,
      is_verified: false,
    },
    created_at: '2026-01-01T00:00:00Z',
    url: 'https://x.com/testuser/status/123',
    metrics: {
      retweet_count: 0,
      like_count: 0,
      reply_count: 0,
      quote_count: 0,
      view_count: 0,
      bookmark_count: 0,
    },
    is_retweet: false,
    is_quote: false,
    is_reply: false,
    lang: 'en',
    entities: { hashtags: [], mentioned_users: [], urls: [] },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useXrayViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetXrayConfig.mockResolvedValue({ success: true, data: undefined });
  });

  // ================================================================
  // Initialization
  // ================================================================

  it('uses initialData when provided (skips config fetch)', () => {
    const initialData = {
      apiUrl: 'https://xray.hexly.ai',
      maskedToken: 'abcd••••qrst',
    };

    const { result } = renderHook(() => useXrayViewModel(initialData));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isConfigured).toBe(true);
    expect(result.current.apiUrl).toBe('https://xray.hexly.ai');
    expect(result.current.maskedToken).toBe('abcd••••qrst');
    expect(result.current.urlMode).toBe('Production');
    expect(mockGetXrayConfig).not.toHaveBeenCalled();
  });

  it('uses initialData with custom URL', () => {
    const initialData = {
      apiUrl: 'https://custom.example.com',
      maskedToken: 'tok•••en',
    };

    const { result } = renderHook(() => useXrayViewModel(initialData));

    expect(result.current.urlMode).toBe('custom');
    expect(result.current.apiUrl).toBe('https://custom.example.com');
  });

  it('fetches config on mount when no initialData', async () => {
    mockGetXrayConfig.mockResolvedValue(SAVED_CONFIG);

    const { result } = renderHook(() => useXrayViewModel());

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for async effect
    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isConfigured).toBe(true);
    expect(result.current.apiUrl).toBe('https://xray.hexly.ai');
    expect(result.current.maskedToken).toBe('abcd••••qrst');
    expect(mockGetXrayConfig).toHaveBeenCalledTimes(1);
  });

  it('stays unconfigured when config fetch returns no data', async () => {
    mockGetXrayConfig.mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useXrayViewModel());

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isConfigured).toBe(false);
  });

  // ================================================================
  // Tweet ID extraction
  // ================================================================

  it('extracts tweet ID from input', async () => {
    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    act(() => {
      result.current.setTweetInput('https://x.com/user/status/12345');
    });

    await vi.waitFor(() => {
      expect(result.current.extractedId).toBe('12345');
    });
  });

  it('sets extractedId to null for invalid input', async () => {
    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    act(() => {
      result.current.setTweetInput('not-a-tweet-url');
    });

    await vi.waitFor(() => {
      expect(result.current.extractedId).toBeNull();
    });
  });

  // ================================================================
  // URL mode
  // ================================================================

  it('handleUrlModeChange updates mode and URL for preset', () => {
    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    act(() => {
      result.current.handleUrlModeChange('Development');
    });

    expect(result.current.urlMode).toBe('Development');
    expect(result.current.apiUrl).toBe('https://xray.dev.hexly.ai');
  });

  it('handleUrlModeChange to custom does not change URL', () => {
    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    act(() => {
      result.current.handleUrlModeChange('custom');
    });

    expect(result.current.urlMode).toBe('custom');
    // URL stays unchanged
    expect(result.current.apiUrl).toBe('https://xray.hexly.ai');
  });

  // ================================================================
  // Config editing
  // ================================================================

  it('startEditing enables edit mode', () => {
    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    act(() => {
      result.current.startEditing();
    });

    expect(result.current.isEditing).toBe(true);
    expect(result.current.apiToken).toBe('');
  });

  it('cancelEditing disables edit mode', () => {
    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    act(() => {
      result.current.startEditing();
    });
    act(() => {
      result.current.setApiToken('some-token');
    });
    act(() => {
      result.current.cancelEditing();
    });

    expect(result.current.isEditing).toBe(false);
    expect(result.current.apiToken).toBe('');
    expect(result.current.error).toBeNull();
  });

  // ================================================================
  // handleSave
  // ================================================================

  it('handleSave saves config and updates state on success', async () => {
    mockSaveXrayConfig.mockResolvedValue({
      success: true,
      data: {
        apiUrl: 'https://xray.hexly.ai',
        maskedToken: 'new-••••-mask',
      },
    });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'old' }),
    );

    act(() => {
      result.current.startEditing();
      result.current.setApiToken('new-token');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.isConfigured).toBe(true);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.maskedToken).toBe('new-••••-mask');
    expect(result.current.apiToken).toBe('');
    expect(result.current.isSaving).toBe(false);
  });

  it('handleSave sets error on failure', async () => {
    mockSaveXrayConfig.mockResolvedValue({
      success: false,
      error: 'Invalid token',
    });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    act(() => {
      result.current.startEditing();
      result.current.setApiToken('bad');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.error).toBe('Invalid token');
    expect(result.current.isEditing).toBe(true); // Still editing
    expect(result.current.isSaving).toBe(false);
  });

  it('handleSave uses default error message when error is undefined', async () => {
    mockSaveXrayConfig.mockResolvedValue({ success: false });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.error).toBe('保存失败');
  });

  // ================================================================
  // handleFetchTweet
  // ================================================================

  it('handleFetchTweet fetches and stores tweet result', async () => {
    mockFetchTweet.mockResolvedValue({
      success: true,
      data: MOCK_TWEET_RESPONSE,
      mock: false,
    });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    act(() => {
      result.current.setTweetInput('https://x.com/user/status/123');
    });

    await act(async () => {
      await result.current.handleFetchTweet();
    });

    expect(result.current.tweetResult).toEqual(MOCK_TWEET_RESPONSE);
    expect(result.current.isMockResult).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.fetchError).toBeNull();
  });

  it('handleFetchTweet sets fetchError on failure', async () => {
    mockFetchTweet.mockResolvedValue({
      success: false,
      error: 'Invalid URL',
    });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    await act(async () => {
      await result.current.handleFetchTweet();
    });

    expect(result.current.fetchError).toBe('Invalid URL');
    expect(result.current.tweetResult).toBeNull();
  });

  it('handleFetchTweet uses default error when error is undefined', async () => {
    mockFetchTweet.mockResolvedValue({ success: false });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    await act(async () => {
      await result.current.handleFetchTweet();
    });

    expect(result.current.fetchError).toBe('获取失败');
  });

  it('handleFetchTweet sets isMockResult for mock data', async () => {
    mockFetchTweet.mockResolvedValue({
      success: true,
      data: MOCK_TWEET_RESPONSE,
      mock: true,
    });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    await act(async () => {
      await result.current.handleFetchTweet();
    });

    expect(result.current.isMockResult).toBe(true);
  });

  // ================================================================
  // toggleRawJson
  // ================================================================

  it('toggleRawJson toggles showRawJson state', () => {
    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    expect(result.current.showRawJson).toBe(false);

    act(() => {
      result.current.toggleRawJson();
    });
    expect(result.current.showRawJson).toBe(true);

    act(() => {
      result.current.toggleRawJson();
    });
    expect(result.current.showRawJson).toBe(false);
  });

  // ================================================================
  // Bookmarks
  // ================================================================

  it('handleFetchBookmarks fetches and stores bookmarks', async () => {
    const tweets = [MOCK_TWEET_RESPONSE.data];
    mockFetchBookmarks.mockResolvedValue({
      success: true,
      data: { data: tweets },
    });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    await act(async () => {
      await result.current.handleFetchBookmarks();
    });

    expect(result.current.bookmarks).toEqual(tweets);
    expect(result.current.isFetchingBookmarks).toBe(false);
    expect(result.current.bookmarksError).toBeNull();
  });

  it('handleFetchBookmarks sets error on failure', async () => {
    mockFetchBookmarks.mockResolvedValue({
      success: false,
      error: 'Not configured',
    });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    await act(async () => {
      await result.current.handleFetchBookmarks();
    });

    expect(result.current.bookmarksError).toBe('Not configured');
  });

  it('handleFetchBookmarks uses default error when error is undefined', async () => {
    mockFetchBookmarks.mockResolvedValue({ success: false });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    await act(async () => {
      await result.current.handleFetchBookmarks();
    });

    expect(result.current.bookmarksError).toBe('获取书签失败');
  });

  // ================================================================
  // handleAddBookmark
  // ================================================================

  it('handleAddBookmark creates link and tracks added IDs', async () => {
    mockCreateLink.mockResolvedValue({ success: true });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    await act(async () => {
      await result.current.handleAddBookmark('https://x.com/user/status/456', '456');
    });

    expect(mockCreateLink).toHaveBeenCalledWith({
      originalUrl: 'https://x.com/user/status/456',
    });
    expect(result.current.addedBookmarkIds.has('456')).toBe(true);
    expect(result.current.addingBookmarkIds.has('456')).toBe(false);
  });

  it('handleAddBookmark does not mark as added when createLink fails', async () => {
    mockCreateLink.mockResolvedValue({ success: false, error: 'Failed' });

    const { result } = renderHook(() =>
      useXrayViewModel({ apiUrl: 'https://xray.hexly.ai', maskedToken: 'tok' }),
    );

    await act(async () => {
      await result.current.handleAddBookmark('https://x.com/user/status/789', '789');
    });

    expect(result.current.addedBookmarkIds.has('789')).toBe(false);
    expect(result.current.addingBookmarkIds.has('789')).toBe(false);
  });
});
