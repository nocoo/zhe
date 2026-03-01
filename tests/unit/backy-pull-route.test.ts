import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyBackyPullWebhook = vi.fn();

vi.mock('@/lib/db', () => ({
  verifyBackyPullWebhook: (...args: unknown[]) => mockVerifyBackyPullWebhook(...args),
}));

const mockGetBackySettings = vi.fn();
const mockGetLinks = vi.fn();
const mockGetFolders = vi.fn();
const mockGetTags = vi.fn();
const mockGetLinkTags = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getBackySettings: mockGetBackySettings,
    getLinks: mockGetLinks,
    getFolders: mockGetFolders,
    getTags: mockGetTags,
    getLinkTags: mockGetLinkTags,
  })),
}));

vi.mock('@/lib/version', () => ({
  APP_VERSION: '1.2.3',
}));

const mockSerializeLinksForExport = vi.fn();
vi.mock('@/models/settings', () => ({
  serializeLinksForExport: (...args: unknown[]) => mockSerializeLinksForExport(...args),
  BACKUP_SCHEMA_VERSION: 2,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { POST, HEAD } from '@/app/api/backy/pull/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/backy/pull', {
    method,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/backy/pull', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when key header is missing', async () => {
    const res = await POST(makeRequest('POST'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Missing');
  });

  it('returns 401 when key is invalid', async () => {
    mockVerifyBackyPullWebhook.mockResolvedValue(null);

    const res = await POST(
      makeRequest('POST', { 'x-webhook-key': 'bad-key' }),
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Invalid');
  });

  it('returns 422 when push config is not configured', async () => {
    mockVerifyBackyPullWebhook.mockResolvedValue({ userId: 'user-1' });
    mockGetBackySettings.mockResolvedValue(null);

    const res = await POST(
      makeRequest('POST', { 'x-webhook-key': 'valid-key' }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain('not configured');
  });

  it('pushes backup and returns 200 on success', async () => {
    mockVerifyBackyPullWebhook.mockResolvedValue({ userId: 'user-1' });
    mockGetBackySettings.mockResolvedValue({
      webhookUrl: 'https://backy.example.com/webhook',
      apiKey: 'sk-123',
    });
    mockGetLinks.mockResolvedValue([
      { id: 1, slug: 'test', originalUrl: 'https://example.com', clicks: 5 },
    ]);
    mockGetFolders.mockResolvedValue([
      { id: 'f1', name: 'Work', icon: 'folder', createdAt: new Date('2026-01-01') },
    ]);
    mockGetTags.mockResolvedValue([
      { id: 't1', name: 'important', color: 'blue', createdAt: new Date('2026-01-01') },
    ]);
    mockGetLinkTags.mockResolvedValue([{ linkId: 1, tagId: 't1' }]);
    mockSerializeLinksForExport.mockReturnValue([{ slug: 'test', originalUrl: 'https://example.com' }]);

    const mockHistory = {
      project_name: 'zhe',
      environment: null,
      total_backups: 1,
      recent_backups: [],
    };

    // First call = POST (push to Backy), second call = GET (inline history)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'backup-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHistory),
      });

    const res = await POST(
      makeRequest('POST', { 'x-webhook-key': 'valid-key' }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toContain('successfully');
    expect(json.tag).toContain('v1.2.3');
    expect(json.stats).toEqual({ links: 1, folders: 1, tags: 1, linkTags: 1 });
    expect(json.history).toEqual(mockHistory);

    // Verify push was sent as POST with auth header
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://backy.example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer sk-123' },
      }),
    );

    // Verify key was passed to verify function (no secret)
    expect(mockVerifyBackyPullWebhook).toHaveBeenCalledWith('valid-key');
  });

  it('returns 502 when push to Backy fails', async () => {
    mockVerifyBackyPullWebhook.mockResolvedValue({ userId: 'user-1' });
    mockGetBackySettings.mockResolvedValue({
      webhookUrl: 'https://backy.example.com/webhook',
      apiKey: 'sk-123',
    });
    mockGetLinks.mockResolvedValue([]);
    mockGetFolders.mockResolvedValue([]);
    mockGetTags.mockResolvedValue([]);
    mockGetLinkTags.mockResolvedValue([]);
    mockSerializeLinksForExport.mockReturnValue([]);

    mockFetch.mockResolvedValue({
      ok: false,
      status: 413,
      text: () => Promise.resolve('{"error":"too large"}'),
    });

    const res = await POST(
      makeRequest('POST', { 'x-webhook-key': 'valid-key' }),
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain('failed');
    expect(json.status).toBe(413);
  });

  it('returns success without history when inline history fetch fails', async () => {
    mockVerifyBackyPullWebhook.mockResolvedValue({ userId: 'user-1' });
    mockGetBackySettings.mockResolvedValue({
      webhookUrl: 'https://backy.example.com/webhook',
      apiKey: 'sk-123',
    });
    mockGetLinks.mockResolvedValue([]);
    mockGetFolders.mockResolvedValue([]);
    mockGetTags.mockResolvedValue([]);
    mockGetLinkTags.mockResolvedValue([]);
    mockSerializeLinksForExport.mockReturnValue([]);

    // POST succeeds, GET fails
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })
      .mockRejectedValueOnce(new Error('timeout'));

    const res = await POST(
      makeRequest('POST', { 'x-webhook-key': 'valid-key' }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.history).toBeUndefined();
  });
});

describe('HEAD /api/backy/pull', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when key header is missing', async () => {
    const res = await HEAD(makeRequest('HEAD'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when key is invalid', async () => {
    mockVerifyBackyPullWebhook.mockResolvedValue(null);

    const res = await HEAD(
      makeRequest('HEAD', { 'x-webhook-key': 'bad-key' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 when key is valid', async () => {
    mockVerifyBackyPullWebhook.mockResolvedValue({ userId: 'user-1' });

    const res = await HEAD(
      makeRequest('HEAD', { 'x-webhook-key': 'valid-key' }),
    );
    expect(res.status).toBe(200);
  });

  it('returns empty body', async () => {
    mockVerifyBackyPullWebhook.mockResolvedValue({ userId: 'user-1' });

    const res = await HEAD(
      makeRequest('HEAD', { 'x-webhook-key': 'valid-key' }),
    );
    const body = await res.text();
    expect(body).toBe('');
  });
});
