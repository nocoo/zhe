import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetBackyConfig = vi.fn();
const mockSaveBackyConfig = vi.fn();
const mockTestBackyConnection = vi.fn();
const mockPushBackup = vi.fn();
const mockFetchBackyHistory = vi.fn();

vi.mock('@/actions/backy', () => ({
  getBackyConfig: (...args: unknown[]) => mockGetBackyConfig(...args),
  saveBackyConfig: (...args: unknown[]) => mockSaveBackyConfig(...args),
  testBackyConnection: (...args: unknown[]) => mockTestBackyConnection(...args),
  pushBackup: (...args: unknown[]) => mockPushBackup(...args),
  fetchBackyHistory: (...args: unknown[]) => mockFetchBackyHistory(...args),
}));

import { useBackyViewModel } from '@/viewmodels/useBackyViewModel';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBackyViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no config
    mockGetBackyConfig.mockResolvedValue({ success: true, data: undefined });
    // Default: history not available (safe for tests that trigger auto-load)
    mockFetchBackyHistory.mockResolvedValue({ success: false });
  });

  // ==================================================================
  // Initial state
  // ==================================================================
  it('returns initial loading state', () => {
    // Don't resolve the config promise yet
    mockGetBackyConfig.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBackyViewModel());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isConfigured).toBe(false);
    expect(result.current.webhookUrl).toBe('');
    expect(result.current.apiKey).toBe('');
    expect(result.current.maskedApiKey).toBeNull();
    expect(result.current.isEditing).toBe(false);
    expect(result.current.testResult).toBeNull();
    expect(result.current.pushResult).toBeNull();
    expect(result.current.history).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('loads config on mount when configured', async () => {
    mockGetBackyConfig.mockResolvedValue({
      success: true,
      data: {
        webhookUrl: 'https://backy.example.com/webhook',
        maskedApiKey: 'sk-1••••cdef',
      },
    });
    mockFetchBackyHistory.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useBackyViewModel());

    // Wait for effect to complete
    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isConfigured).toBe(true);
    expect(result.current.webhookUrl).toBe('https://backy.example.com/webhook');
    expect(result.current.maskedApiKey).toBe('sk-1••••cdef');
  });

  it('auto-loads history on mount when configured', async () => {
    mockGetBackyConfig.mockResolvedValue({
      success: true,
      data: {
        webhookUrl: 'https://backy.example.com/webhook',
        maskedApiKey: 'sk-1••••cdef',
      },
    });
    const mockHistoryData = {
      project_name: 'zhe',
      environment: null,
      total_backups: 3,
      recent_backups: [
        { id: '1', tag: 'v1.0.0', environment: 'prod', file_size: 1024, is_single_json: 1, created_at: '2026-02-24' },
      ],
    };
    mockFetchBackyHistory.mockResolvedValue({ success: true, data: mockHistoryData });

    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    expect(mockFetchBackyHistory).toHaveBeenCalledOnce();
    expect(result.current.history).toEqual(mockHistoryData);
  });

  it('does not auto-load history on mount when not configured', async () => {
    mockGetBackyConfig.mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    expect(mockFetchBackyHistory).not.toHaveBeenCalled();
    expect(result.current.history).toBeNull();
  });

  it('loads without config on mount when not configured', async () => {
    mockGetBackyConfig.mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useBackyViewModel());

    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isConfigured).toBe(false);
  });

  // ==================================================================
  // handleSave
  // ==================================================================
  it('saves config successfully', async () => {
    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    // Set form values
    act(() => {
      result.current.setWebhookUrl('https://backy.example.com/webhook');
      result.current.setApiKey('sk-new-key-1234567890');
    });

    mockSaveBackyConfig.mockResolvedValue({
      success: true,
      data: {
        webhookUrl: 'https://backy.example.com/webhook',
        maskedApiKey: 'sk-n••••7890',
      },
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.isConfigured).toBe(true);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.webhookUrl).toBe('https://backy.example.com/webhook');
    expect(result.current.maskedApiKey).toBe('sk-n••••7890');
    expect(result.current.apiKey).toBe(''); // cleared after save
  });

  it('shows error on save failure', async () => {
    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    act(() => {
      result.current.setWebhookUrl('not-a-url');
      result.current.setApiKey('sk-1234567890abcdef');
    });

    mockSaveBackyConfig.mockResolvedValue({
      success: false,
      error: 'Webhook URL 格式无效',
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.error).toBe('Webhook URL 格式无效');
    expect(result.current.isConfigured).toBe(false);
  });

  it('shows default error when error is empty', async () => {
    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    mockSaveBackyConfig.mockResolvedValue({ success: false });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.error).toBe('保存失败');
  });

  // ==================================================================
  // handleTest
  // ==================================================================
  it('tests connection successfully', async () => {
    mockGetBackyConfig.mockResolvedValue({
      success: true,
      data: { webhookUrl: 'https://backy.example.com/webhook', maskedApiKey: 'sk-1••••cdef' },
    });

    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    mockTestBackyConnection.mockResolvedValue({ success: true });

    await act(async () => {
      await result.current.handleTest();
    });

    expect(result.current.testResult).toEqual({
      ok: true,
      message: '连接成功',
    });
    expect(result.current.isTesting).toBe(false);
  });

  it('shows error on test failure', async () => {
    mockGetBackyConfig.mockResolvedValue({
      success: true,
      data: { webhookUrl: 'https://backy.example.com/webhook', maskedApiKey: 'sk-1••••cdef' },
    });

    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    mockTestBackyConnection.mockResolvedValue({
      success: false,
      error: '连接失败 (401)',
    });

    await act(async () => {
      await result.current.handleTest();
    });

    expect(result.current.testResult).toEqual({
      ok: false,
      message: '连接失败 (401)',
    });
  });

  // ==================================================================
  // handlePush
  // ==================================================================
  it('pushes backup successfully and refreshes history', async () => {
    mockGetBackyConfig.mockResolvedValue({
      success: true,
      data: { webhookUrl: 'https://backy.example.com/webhook', maskedApiKey: 'sk-1••••cdef' },
    });

    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    mockPushBackup.mockResolvedValue({
      success: true,
      data: {
        ok: true,
        message: '推送成功 (120ms)',
        durationMs: 120,
        request: {
          tag: 'v1.2.3-2026-02-24-10lnk-2fld-3tag',
          fileName: 'zhe-backup-2026-02-24.json',
          fileSizeBytes: 512,
          backupStats: { links: 10, folders: 2, tags: 3 },
        },
      },
    });

    const mockHistoryData = {
      project_name: 'zhe',
      environment: null,
      total_backups: 1,
      recent_backups: [
        { id: '1', tag: 'v1.2.3-2026-02-24-10lnk-2fld-3tag', environment: 'dev', file_size: 512, is_single_json: 1, created_at: '2026-02-24T00:00:00Z' },
      ],
    };
    mockFetchBackyHistory.mockResolvedValue({ success: true, data: mockHistoryData });

    await act(async () => {
      await result.current.handlePush();
    });

    expect(result.current.pushResult).toMatchObject({
      ok: true,
      message: expect.stringContaining('推送成功'),
      durationMs: 120,
      request: expect.objectContaining({
        tag: 'v1.2.3-2026-02-24-10lnk-2fld-3tag',
      }),
    });
    expect(result.current.isPushing).toBe(false);
    expect(result.current.history).toEqual(mockHistoryData);
  });

  it('shows error on push failure and still refreshes history', async () => {
    mockGetBackyConfig.mockResolvedValue({
      success: true,
      data: { webhookUrl: 'https://backy.example.com/webhook', maskedApiKey: 'sk-1••••cdef' },
    });
    // Drain mount history call
    mockFetchBackyHistory.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    mockPushBackup.mockResolvedValue({
      success: false,
      data: {
        ok: false,
        message: '推送失败 (413)',
        durationMs: 50,
        request: { tag: 'v1.2.3', fileName: 'zhe-backup-2026-02-24.json', fileSizeBytes: 999999, backupStats: {} },
        response: { status: 413, body: 'too large' },
      },
      error: '推送失败 (413)',
    });

    const mockHistoryData = {
      project_name: 'zhe',
      environment: null,
      total_backups: 5,
      recent_backups: [
        { id: '1', tag: 'v1.0.0', environment: 'prod', file_size: 1024, is_single_json: 1, created_at: '2026-02-24' },
      ],
    };
    mockFetchBackyHistory.mockResolvedValue({ success: true, data: mockHistoryData });

    await act(async () => {
      await result.current.handlePush();
    });

    expect(result.current.pushResult).toMatchObject({
      ok: false,
      message: '推送失败 (413)',
    });
    // History should be refreshed even after failure
    expect(result.current.history).toEqual(mockHistoryData);
  });

  // ==================================================================
  // handleLoadHistory
  // ==================================================================
  it('loads history successfully', async () => {
    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    const mockHistoryData = {
      project_name: 'zhe',
      environment: null,
      total_backups: 2,
      recent_backups: [
        { id: '1', tag: 'v1.0.0', environment: 'prod', file_size: 1024, is_single_json: 1, created_at: '2026-02-24' },
      ],
    };
    mockFetchBackyHistory.mockResolvedValue({ success: true, data: mockHistoryData });

    await act(async () => {
      await result.current.handleLoadHistory();
    });

    expect(result.current.history).toEqual(mockHistoryData);
    expect(result.current.isLoadingHistory).toBe(false);
  });

  it('shows error on history load failure', async () => {
    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    mockFetchBackyHistory.mockResolvedValue({
      success: false,
      error: '获取历史失败',
    });

    await act(async () => {
      await result.current.handleLoadHistory();
    });

    expect(result.current.error).toBe('获取历史失败');
  });

  // ==================================================================
  // Editing mode
  // ==================================================================
  it('startEditing enters edit mode and clears results', async () => {
    mockGetBackyConfig.mockResolvedValue({
      success: true,
      data: { webhookUrl: 'https://backy.example.com/webhook', maskedApiKey: 'sk-1••••cdef' },
    });

    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    // First get a test result
    mockTestBackyConnection.mockResolvedValue({ success: true });
    await act(async () => {
      await result.current.handleTest();
    });
    expect(result.current.testResult).not.toBeNull();

    // Start editing
    act(() => {
      result.current.startEditing();
    });

    expect(result.current.isEditing).toBe(true);
    expect(result.current.apiKey).toBe('');
    expect(result.current.testResult).toBeNull();
    expect(result.current.pushResult).toBeNull();
  });

  it('cancelEditing exits edit mode and clears error', async () => {
    const { result } = renderHook(() => useBackyViewModel());
    await act(async () => {});

    act(() => {
      result.current.startEditing();
      result.current.setApiKey('some-key');
    });

    act(() => {
      result.current.cancelEditing();
    });

    expect(result.current.isEditing).toBe(false);
    expect(result.current.apiKey).toBe('');
    expect(result.current.error).toBeNull();
  });
});
