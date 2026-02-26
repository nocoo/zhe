import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { XrayPage } from '@/components/dashboard/xray-page';
import type { XrayTweetData, XrayTweetResponse } from '@/models/xray';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockHandleSave = vi.fn();
const mockHandleFetchTweet = vi.fn();
const mockHandleFetchBookmarks = vi.fn();
const mockHandleAddBookmark = vi.fn();
const mockHandleUrlModeChange = vi.fn();
const mockStartEditing = vi.fn();
const mockCancelEditing = vi.fn();
const mockToggleRawJson = vi.fn();

const mockVm = {
  apiUrl: 'https://xray.hexly.ai',
  setApiUrl: vi.fn(),
  urlMode: 'Production' as string,
  handleUrlModeChange: mockHandleUrlModeChange,
  apiToken: '',
  setApiToken: vi.fn(),
  maskedToken: null as string | null,
  isConfigured: false,
  isEditing: false,
  isLoading: false,
  isSaving: false,
  isFetching: false,
  error: null as string | null,
  fetchError: null as string | null,
  handleSave: mockHandleSave,
  startEditing: mockStartEditing,
  cancelEditing: mockCancelEditing,
  tweetInput: '',
  setTweetInput: vi.fn(),
  extractedId: null as string | null,
  tweetResult: null as XrayTweetResponse | null,
  isMockResult: false,
  showRawJson: false,
  toggleRawJson: mockToggleRawJson,
  handleFetchTweet: mockHandleFetchTweet,
  bookmarks: [] as XrayTweetData[],
  isFetchingBookmarks: false,
  bookmarksError: null as string | null,
  addingBookmarkIds: new Set<string>(),
  addedBookmarkIds: new Set<string>(),
  handleFetchBookmarks: mockHandleFetchBookmarks,
  handleAddBookmark: mockHandleAddBookmark,
};

vi.mock('@/viewmodels/useXrayViewModel', () => ({
  useXrayViewModel: () => mockVm,
}));

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeTweetData(overrides?: Partial<XrayTweetData>): XrayTweetData {
  return {
    id: '123456789',
    text: 'Hello World tweet text',
    url: 'https://x.com/testuser/status/123456789',
    created_at: '2026-01-15T12:00:00Z',
    lang: 'en',
    is_retweet: false,
    is_quote: false,
    is_reply: false,
    author: {
      id: 'author1',
      name: 'Test Author',
      username: 'testuser',
      profile_image_url: 'https://pbs.twimg.com/profile.jpg',
      is_verified: false,
      followers_count: 1500,
    },
    metrics: {
      view_count: 10000,
      like_count: 200,
      retweet_count: 50,
      reply_count: 10,
      quote_count: 5,
      bookmark_count: 30,
    },
    entities: {
      urls: [],
      hashtags: [],
      mentioned_users: [],
    },
    media: undefined,
    quoted_tweet: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('XrayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVm.apiUrl = 'https://xray.hexly.ai';
    mockVm.urlMode = 'Production';
    mockVm.apiToken = '';
    mockVm.maskedToken = null;
    mockVm.isConfigured = false;
    mockVm.isEditing = false;
    mockVm.isLoading = false;
    mockVm.isSaving = false;
    mockVm.isFetching = false;
    mockVm.error = null;
    mockVm.fetchError = null;
    mockVm.tweetInput = '';
    mockVm.extractedId = null;
    mockVm.tweetResult = null;
    mockVm.isMockResult = false;
    mockVm.showRawJson = false;
    mockVm.bookmarks = [];
    mockVm.isFetchingBookmarks = false;
    mockVm.bookmarksError = null;
    mockVm.addingBookmarkIds = new Set();
    mockVm.addedBookmarkIds = new Set();
  });

  // ── Layout sections ──

  it('renders all three sections', () => {
    render(<XrayPage />);

    expect(screen.getByText('API 配置')).toBeInTheDocument();
    expect(screen.getByText('接口测试')).toBeInTheDocument();
    expect(screen.getByText('我的书签')).toBeInTheDocument();
  });

  // ── Config section: loading ──

  it('shows loading text when isLoading', () => {
    mockVm.isLoading = true;
    render(<XrayPage />);

    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  // ── Config section: unconfigured form ──

  it('shows config form when not configured', () => {
    render(<XrayPage />);

    expect(screen.getByText('API URL')).toBeInTheDocument();
    expect(screen.getByText('API Key')).toBeInTheDocument();
    expect(screen.getByText('保存')).toBeInTheDocument();
  });

  it('shows URL mode buttons including presets and Custom', () => {
    render(<XrayPage />);

    expect(screen.getByRole('button', { name: 'Production' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Development' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument();
  });

  it('shows custom URL input when urlMode is custom', () => {
    mockVm.urlMode = 'custom';
    render(<XrayPage />);

    expect(screen.getByTestId('xray-api-url')).toBeInTheDocument();
  });

  it('shows preset URL text when urlMode is not custom', () => {
    mockVm.urlMode = 'Production';
    mockVm.apiUrl = 'https://xray.hexly.ai';
    render(<XrayPage />);

    expect(screen.getByText('https://xray.hexly.ai')).toBeInTheDocument();
    expect(screen.queryByTestId('xray-api-url')).not.toBeInTheDocument();
  });

  it('calls handleUrlModeChange when mode button clicked', () => {
    render(<XrayPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(mockHandleUrlModeChange).toHaveBeenCalledWith('custom');
  });

  it('shows error message when error is set', () => {
    mockVm.error = 'API URL is required';
    render(<XrayPage />);

    expect(screen.getByTestId('xray-error')).toHaveTextContent('API URL is required');
  });

  it('calls handleSave when save button clicked', () => {
    render(<XrayPage />);

    fireEvent.click(screen.getByText('保存'));
    expect(mockHandleSave).toHaveBeenCalledOnce();
  });

  it('disables save button when isSaving', () => {
    mockVm.isSaving = true;
    render(<XrayPage />);

    expect(screen.getByText('保存').closest('button')).toBeDisabled();
  });

  it('shows cancel button when editing', () => {
    mockVm.isEditing = true;
    render(<XrayPage />);

    expect(screen.getByText('取消')).toBeInTheDocument();
    fireEvent.click(screen.getByText('取消'));
    expect(mockCancelEditing).toHaveBeenCalledOnce();
  });

  // ── Config section: configured state ──

  it('shows configured state with masked token', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'abcd••••wxyz';
    mockVm.apiUrl = 'https://xray.hexly.ai';
    render(<XrayPage />);

    expect(screen.getByText('API URL:')).toBeInTheDocument();
    expect(screen.getByText('https://xray.hexly.ai')).toBeInTheDocument();
    expect(screen.getByText('Key:')).toBeInTheDocument();
    expect(screen.getByText('abcd••••wxyz')).toBeInTheDocument();
  });

  it('shows edit button in configured state', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'abcd••••wxyz';
    render(<XrayPage />);

    const editBtn = screen.getByLabelText('编辑配置');
    fireEvent.click(editBtn);
    expect(mockStartEditing).toHaveBeenCalledOnce();
  });

  // ── Test section ──

  it('shows mock data warning when not configured', () => {
    render(<XrayPage />);

    expect(screen.getByText(/未配置 API，将使用 Mock 数据/)).toBeInTheDocument();
  });

  it('does not show mock warning when configured', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    render(<XrayPage />);

    expect(screen.queryByText(/未配置 API/)).not.toBeInTheDocument();
  });

  it('shows fetch button disabled when no extractedId', () => {
    render(<XrayPage />);

    const fetchBtn = screen.getByText('获取').closest('button');
    expect(fetchBtn).toBeDisabled();
  });

  it('enables fetch button when extractedId is set', () => {
    mockVm.extractedId = '123456789';
    render(<XrayPage />);

    const fetchBtn = screen.getByText('获取').closest('button');
    expect(fetchBtn).not.toBeDisabled();
  });

  it('calls handleFetchTweet when fetch button clicked', () => {
    mockVm.extractedId = '123456789';
    render(<XrayPage />);

    fireEvent.click(screen.getByText('获取'));
    expect(mockHandleFetchTweet).toHaveBeenCalledOnce();
  });

  it('shows extracted tweet ID when input has valid URL', () => {
    mockVm.tweetInput = 'https://x.com/user/status/123';
    mockVm.extractedId = '123';
    render(<XrayPage />);

    expect(screen.getByText('Tweet ID:')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('shows extraction error when input is invalid', () => {
    mockVm.tweetInput = 'not-a-valid-url';
    mockVm.extractedId = null;
    render(<XrayPage />);

    expect(screen.getByText('无法解析 Tweet ID')).toBeInTheDocument();
  });

  it('does not show ID indicator when input is empty', () => {
    mockVm.tweetInput = '';
    render(<XrayPage />);

    expect(screen.queryByText('Tweet ID:')).not.toBeInTheDocument();
    expect(screen.queryByText('无法解析 Tweet ID')).not.toBeInTheDocument();
  });

  it('shows fetch error message', () => {
    mockVm.fetchError = 'API returned 500';
    render(<XrayPage />);

    expect(screen.getByText('API returned 500')).toBeInTheDocument();
  });

  // ── Tweet result display ──

  it('renders tweet card when tweetResult is set', () => {
    const tweet = makeTweetData();
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText('Hello World tweet text')).toBeInTheDocument();
    expect(screen.getByText('Test Author')).toBeInTheDocument();
    expect(screen.getByText('@testuser')).toBeInTheDocument();
  });

  it('shows mock badge when isMockResult', () => {
    const tweet = makeTweetData();
    mockVm.tweetResult = { success: true, data: tweet };
    mockVm.isMockResult = true;
    render(<XrayPage />);

    expect(screen.getByText('Mock 数据')).toBeInTheDocument();
  });

  it('shows verified badge for verified authors', () => {
    const tweet = makeTweetData({
      author: {
        id: 'author1',
        name: 'Verified User',
        username: 'verifieduser',
        profile_image_url: 'https://pbs.twimg.com/profile.jpg',
        is_verified: true,
        followers_count: 100000,
      },
    });
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText('Verified User')).toBeInTheDocument();
  });

  it('renders tweet metrics', () => {
    const tweet = makeTweetData();
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText('浏览')).toBeInTheDocument();
    expect(screen.getByText('喜欢')).toBeInTheDocument();
    expect(screen.getByText('转推')).toBeInTheDocument();
    expect(screen.getByText('回复')).toBeInTheDocument();
    expect(screen.getByText('引用')).toBeInTheDocument();
    expect(screen.getByText('收藏')).toBeInTheDocument();
  });

  it('shows retweet/quote/reply badges when applicable', () => {
    const tweet = makeTweetData({
      is_retweet: true,
      is_quote: true,
      is_reply: true,
    });
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    // Note: '转推' appears in metrics too, so check with getAllByText
    expect(screen.getAllByText('转推').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('引用').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('回复').length).toBeGreaterThanOrEqual(2);
  });

  it('renders hashtags', () => {
    const tweet = makeTweetData({
      entities: {
        urls: [],
        hashtags: ['react', 'typescript'],
        mentioned_users: [],
      },
    });
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText('#react')).toBeInTheDocument();
    expect(screen.getByText('#typescript')).toBeInTheDocument();
  });

  it('renders mentioned users', () => {
    const tweet = makeTweetData({
      entities: {
        urls: [],
        hashtags: [],
        mentioned_users: ['elonmusk', 'openai'],
      },
    });
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText('@elonmusk')).toBeInTheDocument();
    expect(screen.getByText('@openai')).toBeInTheDocument();
  });

  it('renders entity URLs', () => {
    const tweet = makeTweetData({
      entities: {
        urls: ['https://example.com'],
        hashtags: [],
        mentioned_users: [],
      },
    });
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  it('renders photo media', () => {
    const tweet = makeTweetData({
      media: [
        {
          id: 'media1',
          type: 'PHOTO',
          url: 'https://pbs.twimg.com/media/photo1.jpg',
          thumbnail_url: undefined,
        },
      ],
    });
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    const img = screen.getByAltText('Media');
    expect(img).toHaveAttribute('src', 'https://pbs.twimg.com/media/photo1.jpg');
  });

  it('renders video media with play overlay', () => {
    const tweet = makeTweetData({
      media: [
        {
          id: 'media1',
          type: 'VIDEO',
          url: 'https://video.twimg.com/video1.mp4',
          thumbnail_url: 'https://pbs.twimg.com/thumb1.jpg',
        },
      ],
    });
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText('VIDEO')).toBeInTheDocument();
    const thumb = screen.getByAltText('Video thumbnail');
    expect(thumb).toHaveAttribute('src', 'https://pbs.twimg.com/thumb1.jpg');
  });

  it('renders GIF media with GIF badge', () => {
    const tweet = makeTweetData({
      media: [
        {
          id: 'media1',
          type: 'GIF',
          url: 'https://video.twimg.com/gif1.mp4',
          thumbnail_url: undefined,
        },
      ],
    });
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText('GIF')).toBeInTheDocument();
  });

  it('renders quoted tweet', () => {
    const quotedTweet = makeTweetData({
      id: 'quoted1',
      text: 'This is the quoted tweet',
      author: {
        id: 'author2',
        name: 'Quoted Author',
        username: 'quoteduser',
        profile_image_url: 'https://pbs.twimg.com/profile2.jpg',
        is_verified: false,
        followers_count: 500,
      },
    });
    const tweet = makeTweetData({ quoted_tweet: quotedTweet });
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText('引用推文')).toBeInTheDocument();
    expect(screen.getByText('This is the quoted tweet')).toBeInTheDocument();
    expect(screen.getByText('Quoted Author')).toBeInTheDocument();
  });

  // ── Raw JSON toggle ──

  it('shows "展开 原始 JSON" button when result exists', () => {
    const tweet = makeTweetData();
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    expect(screen.getByText(/展开/)).toBeInTheDocument();
    expect(screen.getByText(/原始 JSON/)).toBeInTheDocument();
  });

  it('calls toggleRawJson when toggle button clicked', () => {
    const tweet = makeTweetData();
    mockVm.tweetResult = { success: true, data: tweet };
    render(<XrayPage />);

    fireEvent.click(screen.getByText(/原始 JSON/).closest('button')!);
    expect(mockToggleRawJson).toHaveBeenCalledOnce();
  });

  it('shows raw JSON when showRawJson is true', () => {
    const tweet = makeTweetData();
    mockVm.tweetResult = { success: true, data: tweet };
    mockVm.showRawJson = true;
    render(<XrayPage />);

    expect(screen.getByText(/收起/)).toBeInTheDocument();
    // The pre element should contain the JSON
    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
  });

  // ── Bookmarks section ──

  it('shows prompt to configure API when not configured', () => {
    render(<XrayPage />);

    expect(screen.getByText(/请先在上方配置 xray API/)).toBeInTheDocument();
  });

  it('shows empty bookmarks prompt when configured but no bookmarks', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    render(<XrayPage />);

    expect(screen.getByText(/点击「加载书签」/)).toBeInTheDocument();
  });

  it('disables bookmark fetch button when not configured', () => {
    render(<XrayPage />);

    const btn = screen.getByText('加载书签').closest('button');
    expect(btn).toBeDisabled();
  });

  it('enables bookmark fetch button when configured', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    render(<XrayPage />);

    const btn = screen.getByText('加载书签').closest('button');
    expect(btn).not.toBeDisabled();
  });

  it('calls handleFetchBookmarks when button clicked', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    render(<XrayPage />);

    fireEvent.click(screen.getByText('加载书签'));
    expect(mockHandleFetchBookmarks).toHaveBeenCalledOnce();
  });

  it('shows loading state for bookmarks', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    mockVm.isFetchingBookmarks = true;
    render(<XrayPage />);

    expect(screen.getByText('加载中')).toBeInTheDocument();
  });

  it('shows bookmarks error', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    mockVm.bookmarksError = 'Failed to load bookmarks';
    render(<XrayPage />);

    expect(screen.getByText('Failed to load bookmarks')).toBeInTheDocument();
  });

  it('renders bookmark tweets with add buttons', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    mockVm.bookmarks = [
      makeTweetData({ id: 'bk1', text: 'Bookmark tweet 1' }),
      makeTweetData({ id: 'bk2', text: 'Bookmark tweet 2' }),
    ];
    render(<XrayPage />);

    expect(screen.getByText('Bookmark tweet 1')).toBeInTheDocument();
    expect(screen.getByText('Bookmark tweet 2')).toBeInTheDocument();
    // Two "收录" buttons
    expect(screen.getAllByText('收录')).toHaveLength(2);
  });

  it('shows bookmark count badge', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    mockVm.bookmarks = [
      makeTweetData({ id: 'bk1' }),
      makeTweetData({ id: 'bk2' }),
    ];
    render(<XrayPage />);

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows "已收录" for already added bookmarks', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    mockVm.bookmarks = [makeTweetData({ id: 'bk1', text: 'Added bookmark' })];
    mockVm.addedBookmarkIds = new Set(['bk1']);
    render(<XrayPage />);

    expect(screen.getByText('已收录')).toBeInTheDocument();
    expect(screen.queryByText('收录')).not.toBeInTheDocument();
  });

  it('shows "收录中" for bookmark being added', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    mockVm.bookmarks = [makeTweetData({ id: 'bk1', text: 'Adding bookmark' })];
    mockVm.addingBookmarkIds = new Set(['bk1']);
    render(<XrayPage />);

    expect(screen.getByText('收录中')).toBeInTheDocument();
  });

  it('calls handleAddBookmark with tweet URL and ID when add button clicked', () => {
    mockVm.isConfigured = true;
    mockVm.maskedToken = 'test';
    const tweet = makeTweetData({ id: 'bk1', url: 'https://x.com/user/status/bk1' });
    mockVm.bookmarks = [tweet];
    render(<XrayPage />);

    fireEvent.click(screen.getByText('收录'));
    expect(mockHandleAddBookmark).toHaveBeenCalledWith(
      'https://x.com/user/status/bk1',
      'bk1',
    );
  });

  // ── Enter key to fetch ──

  it('triggers fetch on Enter key when extractedId exists', () => {
    mockVm.tweetInput = 'https://x.com/user/status/123';
    mockVm.extractedId = '123';
    render(<XrayPage />);

    const input = screen.getByTestId('xray-tweet-input');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockHandleFetchTweet).toHaveBeenCalledOnce();
  });

  it('does not trigger fetch on Enter when no extractedId', () => {
    mockVm.tweetInput = 'invalid';
    mockVm.extractedId = null;
    render(<XrayPage />);

    const input = screen.getByTestId('xray-tweet-input');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockHandleFetchTweet).not.toHaveBeenCalled();
  });

  it('does not trigger fetch on Enter when isFetching', () => {
    mockVm.tweetInput = 'https://x.com/user/status/123';
    mockVm.extractedId = '123';
    mockVm.isFetching = true;
    render(<XrayPage />);

    const input = screen.getByTestId('xray-tweet-input');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockHandleFetchTweet).not.toHaveBeenCalled();
  });
});
