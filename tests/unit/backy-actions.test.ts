import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearMockStorage } from '../setup';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserId = 'user-backy-123';
vi.mock('@/auth', () => ({
  auth: vi.fn(() =>
    Promise.resolve({ user: { id: mockUserId, name: 'Test' } }),
  ),
}));

// Mock ScopedDB
const mockGetBackySettings = vi.fn();
const mockUpsertBackySettings = vi.fn();
const mockGetLinks = vi.fn();
const mockGetFolders = vi.fn();
const mockGetTags = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getBackySettings: mockGetBackySettings,
    upsertBackySettings: mockUpsertBackySettings,
    getLinks: mockGetLinks,
    getFolders: mockGetFolders,
    getTags: mockGetTags,
  })),
}));

// Mock APP_VERSION
vi.mock('@/lib/version', () => ({
  APP_VERSION: '1.2.3',
}));

// Mock serializeLinksForExport
const mockSerializeLinksForExport = vi.fn();
vi.mock('@/models/settings', () => ({
  serializeLinksForExport: (...args: unknown[]) => mockSerializeLinksForExport(...args),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  getBackyConfig,
  saveBackyConfig,
  testBackyConnection,
  fetchBackyHistory,
  pushBackup,
} from '@/actions/backy';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('backy actions', () => {
  beforeEach(() => {
    clearMockStorage();
    vi.clearAllMocks();
  });

  // ==================================================================
  // getBackyConfig
  // ==================================================================
  describe('getBackyConfig', () => {
    it('returns config with masked API key when configured', async () => {
      mockGetBackySettings.mockResolvedValue({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });

      const result = await getBackyConfig();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        webhookUrl: 'https://backy.example.com/webhook',
        maskedApiKey: 'sk-1•••••••••••cdef',
      });
    });

    it('returns undefined data when not configured', async () => {
      mockGetBackySettings.mockResolvedValue(null);

      const result = await getBackyConfig();
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('returns error when auth fails', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await getBackyConfig();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when DB throws', async () => {
      mockGetBackySettings.mockRejectedValue(new Error('DB error'));

      const result = await getBackyConfig();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to load Backy config');
    });
  });

  // ==================================================================
  // saveBackyConfig
  // ==================================================================
  describe('saveBackyConfig', () => {
    it('saves valid config and returns masked key', async () => {
      mockUpsertBackySettings.mockResolvedValue({
        userId: mockUserId,
        previewStyle: 'favicon',
        backyWebhookUrl: 'https://backy.example.com/webhook',
        backyApiKey: 'sk-1234567890abcdef',
      });

      const result = await saveBackyConfig({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });

      expect(result.success).toBe(true);
      expect(result.data?.webhookUrl).toBe('https://backy.example.com/webhook');
      expect(result.data?.maskedApiKey).toBe('sk-1•••••••••••cdef');
      expect(mockUpsertBackySettings).toHaveBeenCalledWith({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
    });

    it('rejects invalid webhook URL', async () => {
      const result = await saveBackyConfig({
        webhookUrl: 'not-a-url',
        apiKey: 'sk-1234567890abcdef',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('格式无效');
      expect(mockUpsertBackySettings).not.toHaveBeenCalled();
    });

    it('rejects empty API key', async () => {
      const result = await saveBackyConfig({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API Key');
    });

    it('trims whitespace from inputs', async () => {
      mockUpsertBackySettings.mockResolvedValue({
        userId: mockUserId,
        previewStyle: 'favicon',
        backyWebhookUrl: 'https://backy.example.com/webhook',
        backyApiKey: 'sk-1234567890abcdef',
      });

      await saveBackyConfig({
        webhookUrl: '  https://backy.example.com/webhook  ',
        apiKey: '  sk-1234567890abcdef  ',
      });

      expect(mockUpsertBackySettings).toHaveBeenCalledWith({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
    });

    it('returns error when auth fails', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await saveBackyConfig({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when DB throws', async () => {
      mockUpsertBackySettings.mockRejectedValue(new Error('DB error'));

      const result = await saveBackyConfig({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to save Backy config');
    });
  });

  // ==================================================================
  // testBackyConnection
  // ==================================================================
  describe('testBackyConnection', () => {
    it('returns success when HEAD request succeeds', async () => {
      mockGetBackySettings.mockResolvedValue({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      mockFetch.mockResolvedValue({ ok: true });

      const result = await testBackyConnection();
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://backy.example.com/webhook', {
        method: 'HEAD',
        headers: { Authorization: 'Bearer sk-1234567890abcdef' },
      });
    });

    it('returns error when HEAD request fails', async () => {
      mockGetBackySettings.mockResolvedValue({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      mockFetch.mockResolvedValue({ ok: false, status: 401 });

      const result = await testBackyConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });

    it('returns error when not configured', async () => {
      mockGetBackySettings.mockResolvedValue(null);

      const result = await testBackyConnection();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Backy 未配置');
    });

    it('returns error when fetch throws', async () => {
      mockGetBackySettings.mockResolvedValue({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await testBackyConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('无法访问');
    });

    it('returns error when auth fails', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await testBackyConnection();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  // ==================================================================
  // fetchBackyHistory
  // ==================================================================
  describe('fetchBackyHistory', () => {
    const mockHistory = {
      project_name: 'zhe',
      environment: 'prod',
      total_backups: 3,
      recent_backups: [
        { id: '1', tag: 'v1.2.3-2026-02-24-10lnk-2fld-3tag', environment: 'prod', file_size: 1024, is_single_json: 1, created_at: '2026-02-24T00:00:00Z' },
      ],
    };

    it('returns history on success', async () => {
      mockGetBackySettings.mockResolvedValue({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockHistory),
      });

      const result = await fetchBackyHistory();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockHistory);
    });

    it('returns error when GET request fails', async () => {
      mockGetBackySettings.mockResolvedValue({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await fetchBackyHistory();
      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('returns error when not configured', async () => {
      mockGetBackySettings.mockResolvedValue(null);

      const result = await fetchBackyHistory();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Backy 未配置');
    });

    it('returns error when auth fails', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await fetchBackyHistory();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  // ==================================================================
  // pushBackup
  // ==================================================================
  describe('pushBackup', () => {
    const mockLinks = [
      { id: 1, slug: 'test', originalUrl: 'https://example.com', clicks: 5 },
    ];
    const mockFoldersData = [{ id: 'f1', name: 'Work' }];
    const mockTagsData = [{ id: 't1', name: 'important', color: '#ff0000' }];
    const mockSerialized = [{ slug: 'test', originalUrl: 'https://example.com' }];

    const mockPushResult = {
      id: 'backup-1',
      project_name: 'zhe',
      tag: 'v1.2.3-2026-02-24-1lnk-1fld-1tag',
      environment: 'dev',
      file_size: 512,
      is_single_json: 1,
      created_at: '2026-02-24T12:00:00Z',
    };

    it('exports data and pushes backup successfully', async () => {
      mockGetBackySettings.mockResolvedValue({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      mockGetLinks.mockResolvedValue(mockLinks);
      mockGetFolders.mockResolvedValue(mockFoldersData);
      mockGetTags.mockResolvedValue(mockTagsData);
      mockSerializeLinksForExport.mockReturnValue(mockSerialized);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPushResult),
      });

      const result = await pushBackup();
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        ok: true,
        message: expect.stringContaining('推送成功'),
        durationMs: expect.any(Number),
        request: {
          tag: expect.stringContaining('v1.2.3'),
          fileName: expect.stringContaining('zhe-backup-'),
          fileSizeBytes: expect.any(Number),
          backupStats: { links: 1, folders: 1, tags: 1 },
        },
      });

      // Verify fetch was called with correct args
      expect(mockFetch).toHaveBeenCalledWith(
        'https://backy.example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { Authorization: 'Bearer sk-1234567890abcdef' },
        }),
      );

      // Verify FormData body
      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('environment')).toBe('dev');
      expect(body.get('tag')).toContain('v1.2.3');
      expect(body.get('tag')).toContain('1lnk');
      expect(body.get('tag')).toContain('1fld');
      expect(body.get('tag')).toContain('1tag');
    });

    it('returns error with detail when POST fails', async () => {
      mockGetBackySettings.mockResolvedValue({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      mockGetLinks.mockResolvedValue(mockLinks);
      mockGetFolders.mockResolvedValue(mockFoldersData);
      mockGetTags.mockResolvedValue(mockTagsData);
      mockSerializeLinksForExport.mockReturnValue(mockSerialized);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 413,
        text: () => Promise.resolve('{"error":"too large"}'),
      });

      const result = await pushBackup();
      expect(result.success).toBe(false);
      expect(result.error).toContain('413');
      expect(result.data).toMatchObject({
        ok: false,
        durationMs: expect.any(Number),
        request: expect.objectContaining({ tag: expect.stringContaining('v1.2.3') }),
        response: { status: 413, body: { error: 'too large' } },
      });
    });

    it('returns error when not configured', async () => {
      mockGetBackySettings.mockResolvedValue(null);

      const result = await pushBackup();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Backy 未配置');
    });

    it('returns error when auth fails', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValueOnce(null);

      const result = await pushBackup();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when fetch throws', async () => {
      mockGetBackySettings.mockResolvedValue({
        webhookUrl: 'https://backy.example.com/webhook',
        apiKey: 'sk-1234567890abcdef',
      });
      mockGetLinks.mockResolvedValue(mockLinks);
      mockGetFolders.mockResolvedValue(mockFoldersData);
      mockGetTags.mockResolvedValue(mockTagsData);
      mockSerializeLinksForExport.mockReturnValue(mockSerialized);
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await pushBackup();
      expect(result.success).toBe(false);
      expect(result.error).toBe('推送备份失败');
    });
  });
});
