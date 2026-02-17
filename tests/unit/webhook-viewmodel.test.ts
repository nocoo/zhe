import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { DashboardService } from '@/contexts/dashboard-service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetWebhookToken = vi.fn();
const mockCreateWebhookToken = vi.fn();
const mockRevokeWebhookToken = vi.fn();
const mockUpdateWebhookRateLimit = vi.fn();

vi.mock('@/actions/webhook', () => ({
  getWebhookToken: (...args: unknown[]) => mockGetWebhookToken(...args),
  createWebhookToken: (...args: unknown[]) => mockCreateWebhookToken(...args),
  revokeWebhookToken: (...args: unknown[]) => mockRevokeWebhookToken(...args),
  updateWebhookRateLimit: (...args: unknown[]) => mockUpdateWebhookRateLimit(...args),
}));

const mockService: DashboardService = {
  links: [],
  folders: [],
  loading: false,
  siteUrl: 'https://zhe.example.com',
  handleLinkCreated: vi.fn(),
  handleLinkDeleted: vi.fn(),
  handleLinkUpdated: vi.fn(),
  handleFolderCreated: vi.fn(),
  handleFolderDeleted: vi.fn(),
  handleFolderUpdated: vi.fn(),
};

vi.mock('@/contexts/dashboard-service', () => ({
  useDashboardService: () => mockService,
}));

// Import after mocks
import { useWebhookViewModel } from '@/viewmodels/useWebhookViewModel';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWebhookViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWebhookToken.mockResolvedValue({ success: true, data: null });
  });

  // ====================================================================
  // Initial state & loading
  // ====================================================================

  it('returns initial state with loading true', () => {
    // Never resolve — so we catch the initial state
    mockGetWebhookToken.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useWebhookViewModel());

    expect(result.current.token).toBeNull();
    expect(result.current.createdAt).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isRevoking).toBe(false);
    expect(result.current.webhookUrl).toBeNull();
  });

  it('loads existing token on mount', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'abc-123', createdAt: '2026-01-15T00:00:00.000Z' },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.token).toBe('abc-123');
    expect(result.current.createdAt).toBe('2026-01-15T00:00:00.000Z');
    expect(result.current.webhookUrl).toBe('https://zhe.example.com/api/webhook/abc-123');
  });

  it('sets token to null when no token exists', async () => {
    mockGetWebhookToken.mockResolvedValue({ success: true, data: null });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.token).toBeNull();
    expect(result.current.webhookUrl).toBeNull();
  });

  it('handles load failure gracefully', async () => {
    mockGetWebhookToken.mockResolvedValue({ success: false, error: 'Unauthorized' });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.token).toBeNull();
  });

  // ====================================================================
  // handleGenerate
  // ====================================================================

  it('generates a new token', async () => {
    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockCreateWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'new-token-456', createdAt: '2026-02-01T00:00:00.000Z' },
    });

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mockCreateWebhookToken).toHaveBeenCalledOnce();
    expect(result.current.token).toBe('new-token-456');
    expect(result.current.createdAt).toBe('2026-02-01T00:00:00.000Z');
    expect(result.current.webhookUrl).toBe('https://zhe.example.com/api/webhook/new-token-456');
    expect(result.current.isGenerating).toBe(false);
  });

  it('sets isGenerating while generating', async () => {
    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resolveCreate!: (v: unknown) => void;
    mockCreateWebhookToken.mockReturnValue(
      new Promise((r) => { resolveCreate = r; }),
    );

    let generatePromise: Promise<void>;
    act(() => {
      generatePromise = result.current.handleGenerate();
    });

    expect(result.current.isGenerating).toBe(true);

    await act(async () => {
      resolveCreate({ success: true, data: { token: 'x', createdAt: '2026-01-01' } });
      await generatePromise!;
    });

    expect(result.current.isGenerating).toBe(false);
  });

  it('handles generate failure gracefully', async () => {
    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockCreateWebhookToken.mockResolvedValue({ success: false, error: 'Server error' });

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });

  // ====================================================================
  // handleRevoke
  // ====================================================================

  it('revokes a token', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'existing-token', createdAt: '2026-01-15T00:00:00.000Z' },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.token).toBe('existing-token'));

    mockRevokeWebhookToken.mockResolvedValue({ success: true });

    await act(async () => {
      await result.current.handleRevoke();
    });

    expect(mockRevokeWebhookToken).toHaveBeenCalledOnce();
    expect(result.current.token).toBeNull();
    expect(result.current.createdAt).toBeNull();
    expect(result.current.webhookUrl).toBeNull();
    expect(result.current.isRevoking).toBe(false);
  });

  it('sets isRevoking while revoking', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'existing-token', createdAt: '2026-01-15T00:00:00.000Z' },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.token).toBe('existing-token'));

    let resolveRevoke!: (v: unknown) => void;
    mockRevokeWebhookToken.mockReturnValue(
      new Promise((r) => { resolveRevoke = r; }),
    );

    let revokePromise: Promise<void>;
    act(() => {
      revokePromise = result.current.handleRevoke();
    });

    expect(result.current.isRevoking).toBe(true);

    await act(async () => {
      resolveRevoke({ success: true });
      await revokePromise!;
    });

    expect(result.current.isRevoking).toBe(false);
  });

  it('keeps token if revoke fails', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'existing-token', createdAt: '2026-01-15T00:00:00.000Z' },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.token).toBe('existing-token'));

    mockRevokeWebhookToken.mockResolvedValue({ success: false, error: 'DB error' });

    await act(async () => {
      await result.current.handleRevoke();
    });

    expect(result.current.token).toBe('existing-token');
    expect(result.current.isRevoking).toBe(false);
  });

  // ====================================================================
  // webhookUrl derivation
  // ====================================================================

  it('derives webhookUrl from siteUrl and token', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'my-token', createdAt: '2026-01-01' },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.webhookUrl).toBe('https://zhe.example.com/api/webhook/my-token');
  });

  // ====================================================================
  // rateLimit
  // ====================================================================

  it('defaults rateLimit to RATE_LIMIT_DEFAULT_MAX (5)', async () => {
    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rateLimit).toBe(5);
  });

  it('loads rateLimit from existing token data', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'abc-123', createdAt: '2026-01-15', rateLimit: 8 },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rateLimit).toBe(8);
  });

  it('falls back to default when rateLimit is missing from token data', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'abc-123', createdAt: '2026-01-15' },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rateLimit).toBe(5);
  });

  it('sets rateLimit from handleGenerate response', async () => {
    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockCreateWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'new-token', createdAt: '2026-02-01', rateLimit: 7 },
    });

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(result.current.rateLimit).toBe(7);
  });

  it('resets rateLimit to default on revoke', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'existing', createdAt: '2026-01-15', rateLimit: 9 },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.rateLimit).toBe(9));

    mockRevokeWebhookToken.mockResolvedValue({ success: true });

    await act(async () => {
      await result.current.handleRevoke();
    });

    expect(result.current.rateLimit).toBe(5);
  });

  // ====================================================================
  // handleRateLimitChange
  // ====================================================================

  it('optimistically updates rateLimit and confirms from server', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'abc', createdAt: '2026-01-15', rateLimit: 5 },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockUpdateWebhookRateLimit.mockResolvedValue({
      success: true,
      data: { rateLimit: 8 },
    });

    await act(async () => {
      await result.current.handleRateLimitChange(8);
    });

    expect(mockUpdateWebhookRateLimit).toHaveBeenCalledWith(8);
    expect(result.current.rateLimit).toBe(8);
  });

  it('keeps optimistic value when server confirms same value', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'abc', createdAt: '2026-01-15', rateLimit: 5 },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockUpdateWebhookRateLimit.mockResolvedValue({
      success: true,
      data: { rateLimit: 3 },
    });

    await act(async () => {
      await result.current.handleRateLimitChange(3);
    });

    // Server confirmed 3, should stay 3
    expect(result.current.rateLimit).toBe(3);
  });

  it('handles server clamping the rate limit value', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'abc', createdAt: '2026-01-15', rateLimit: 5 },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Client sends 15 but server clamps to 10
    mockUpdateWebhookRateLimit.mockResolvedValue({
      success: true,
      data: { rateLimit: 10 },
    });

    await act(async () => {
      await result.current.handleRateLimitChange(15);
    });

    // Should use server-clamped value
    expect(result.current.rateLimit).toBe(10);
  });

  it('keeps optimistic value when updateWebhookRateLimit fails', async () => {
    mockGetWebhookToken.mockResolvedValue({
      success: true,
      data: { token: 'abc', createdAt: '2026-01-15', rateLimit: 5 },
    });

    const { result } = renderHook(() => useWebhookViewModel());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockUpdateWebhookRateLimit.mockResolvedValue({
      success: false,
      error: 'DB error',
    });

    await act(async () => {
      await result.current.handleRateLimitChange(7);
    });

    // Optimistic value stays since we don't rollback
    expect(result.current.rateLimit).toBe(7);
  });
});
