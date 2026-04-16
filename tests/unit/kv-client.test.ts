vi.unmock('@/lib/kv/client');

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isKVConfigured,
  kvPutLink,
  kvDeleteLink,
  kvBulkPutLinks,
  kvListKeys,
  kvBulkDeleteLinks,
  type KVLinkData,
} from '@/lib/kv/client';
import { unwrap } from '../test-utils';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const VALID_ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
  CLOUDFLARE_KV_NAMESPACE_ID: 'test-kv-namespace-id',
  CLOUDFLARE_API_TOKEN: 'test-api-token',
};

const BASE_URL =
  'https://api.cloudflare.com/client/v4/accounts/test-account-id/storage/kv/namespaces/test-kv-namespace-id';

function setEnv(overrides: Partial<typeof VALID_ENV> = {}) {
  const env = { ...VALID_ENV, ...overrides };
  process.env.CLOUDFLARE_ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_KV_NAMESPACE_ID = env.CLOUDFLARE_KV_NAMESPACE_ID;
  process.env.CLOUDFLARE_API_TOKEN = env.CLOUDFLARE_API_TOKEN;
}

function clearEnv() {
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
}

const sampleData: KVLinkData = {
  id: 42,
  originalUrl: 'https://example.com',
  expiresAt: null,
};

// ─── isKVConfigured ─────────────────────────────────────────────────────────

describe('isKVConfigured', () => {
  afterEach(() => clearEnv());

  it('returns true when all env vars are set', () => {
    setEnv();
    expect(isKVConfigured()).toBe(true);
  });

  it('returns false when CLOUDFLARE_ACCOUNT_ID is missing', () => {
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'ns';
    process.env.CLOUDFLARE_API_TOKEN = 'tok';
    expect(isKVConfigured()).toBe(false);
  });

  it('returns false when CLOUDFLARE_KV_NAMESPACE_ID is missing', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_API_TOKEN = 'tok';
    expect(isKVConfigured()).toBe(false);
  });

  it('returns false when CLOUDFLARE_API_TOKEN is missing', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'ns';
    expect(isKVConfigured()).toBe(false);
  });

  it('returns false when all env vars are missing', () => {
    expect(isKVConfigured()).toBe(false);
  });

  it('returns false when env vars are empty strings', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = '';
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = '';
    process.env.CLOUDFLARE_API_TOKEN = '';
    expect(isKVConfigured()).toBe(false);
  });
});

// ─── kvPutLink ──────────────────────────────────────────────────────────────

describe('kvPutLink', () => {
  beforeEach(() => mockFetch.mockReset());
  afterEach(() => clearEnv());

  it('silently skips when KV is not configured', async () => {
    await kvPutLink('test-slug', sampleData);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends correct PUT request with JSON body', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    await kvPutLink('my-slug', sampleData);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = unwrap(mockFetch.mock.calls[0]);

    expect(url).toBe(`${BASE_URL}/values/my-slug`);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-api-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual(sampleData);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('URL-encodes the slug', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    await kvPutLink('hello world/test', sampleData);

    const [url] = unwrap(mockFetch.mock.calls[0]);
    expect(url).toBe(`${BASE_URL}/values/hello%20world%2Ftest`);
  });

  it('logs error but does not throw on non-ok response', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await expect(kvPutLink('slug', sampleData)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KV put failed'),
      403,
      'Forbidden',
    );
    consoleSpy.mockRestore();
  });

  it('logs error but does not throw on network failure', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(kvPutLink('slug', sampleData)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KV put error'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('appends expiration query param when expiresAt is in the future', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    const futureMs = Date.now() + 3_600_000; // 1 hour from now
    const data: KVLinkData = { id: 1, originalUrl: 'https://example.com', expiresAt: futureMs };
    await kvPutLink('exp-slug', data);

    const [url] = unwrap(mockFetch.mock.calls[0]);
    expect(url).toBe(`${BASE_URL}/values/exp-slug?expiration=${Math.floor(futureMs / 1000)}`);
  });

  it('does not append expiration when expiresAt is null', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    await kvPutLink('no-exp', { id: 1, originalUrl: 'https://example.com', expiresAt: null });

    const [url] = unwrap(mockFetch.mock.calls[0]);
    expect(url).toBe(`${BASE_URL}/values/no-exp`);
    expect(url).not.toContain('expiration');
  });

  it('does not append expiration when expiresAt is in the past', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    const pastMs = Date.now() - 3_600_000; // 1 hour ago
    await kvPutLink('past-slug', { id: 1, originalUrl: 'https://example.com', expiresAt: pastMs });

    const [url] = unwrap(mockFetch.mock.calls[0]);
    expect(url).toBe(`${BASE_URL}/values/past-slug`);
    expect(url).not.toContain('expiration');
  });
});

// ─── kvDeleteLink ───────────────────────────────────────────────────────────

describe('kvDeleteLink', () => {
  beforeEach(() => mockFetch.mockReset());
  afterEach(() => clearEnv());

  it('silently skips when KV is not configured', async () => {
    await kvDeleteLink('test-slug');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends correct DELETE request', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    await kvDeleteLink('my-slug');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = unwrap(mockFetch.mock.calls[0]);

    expect(url).toBe(`${BASE_URL}/values/my-slug`);
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-api-token',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('logs error but does not throw on non-ok response', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    await expect(kvDeleteLink('slug')).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KV delete failed'),
      404,
      'Not Found',
    );
    consoleSpy.mockRestore();
  });

  it('logs error but does not throw on network failure', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('timeout'));

    await expect(kvDeleteLink('slug')).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('KV delete error'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});

// ─── kvBulkPutLinks ─────────────────────────────────────────────────────────

describe('kvBulkPutLinks', () => {
  beforeEach(() => mockFetch.mockReset());
  afterEach(() => clearEnv());

  it('returns zeros when KV is not configured', async () => {
    const result = await kvBulkPutLinks([{ slug: 'a', data: sampleData }]);
    expect(result).toEqual({ success: 0, failed: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns zeros for empty entries array', async () => {
    setEnv();
    const result = await kvBulkPutLinks([]);
    expect(result).toEqual({ success: 0, failed: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends correct bulk PUT request', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    const entries = [
      { slug: 'slug-a', data: { id: 1, originalUrl: 'https://a.com', expiresAt: null } },
      { slug: 'slug-b', data: { id: 2, originalUrl: 'https://b.com', expiresAt: 1700000000000 } },
    ];

    const result = await kvBulkPutLinks(entries);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = unwrap(mockFetch.mock.calls[0]);

    expect(url).toBe(`${BASE_URL}/bulk`);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-api-token',
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(init.body);
    expect(body).toEqual([
      { key: 'slug-a', value: JSON.stringify(unwrap(entries[0]).data) },
      { key: 'slug-b', value: JSON.stringify(unwrap(entries[1]).data) },
    ]);
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(result).toEqual({ success: 2, failed: 0 });
  });

  it('counts failed entries on non-ok response', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const entries = [
      { slug: 'a', data: sampleData },
      { slug: 'b', data: sampleData },
    ];
    const result = await kvBulkPutLinks(entries);

    expect(result).toEqual({ success: 0, failed: 2 });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('counts failed entries on network error', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const entries = [{ slug: 'x', data: sampleData }];
    const result = await kvBulkPutLinks(entries);

    expect(result).toEqual({ success: 0, failed: 1 });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('includes expiration field when expiresAt is in the future', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    const futureMs = Date.now() + 7_200_000; // 2 hours from now
    const entries = [
      { slug: 'no-exp', data: { id: 1, originalUrl: 'https://a.com', expiresAt: null } as KVLinkData },
      { slug: 'has-exp', data: { id: 2, originalUrl: 'https://b.com', expiresAt: futureMs } as KVLinkData },
    ];

    await kvBulkPutLinks(entries);

    const body = JSON.parse(unwrap(unwrap(mockFetch.mock.calls[0])[1]).body);
    expect(body[0]).toEqual({ key: 'no-exp', value: JSON.stringify(unwrap(entries[0]).data) });
    expect(body[1]).toEqual({
      key: 'has-exp',
      value: JSON.stringify(unwrap(entries[1]).data),
      expiration: Math.floor(futureMs / 1000),
    });
  });

  it('omits expiration field when expiresAt is null', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    const entries = [
      { slug: 'a', data: { id: 1, originalUrl: 'https://a.com', expiresAt: null } as KVLinkData },
    ];

    await kvBulkPutLinks(entries);

    const body = JSON.parse(unwrap(unwrap(mockFetch.mock.calls[0])[1]).body);
    expect(body[0]).toEqual({ key: 'a', value: JSON.stringify(unwrap(entries[0]).data) });
    expect(body[0]).not.toHaveProperty('expiration');
  });

  it('omits expiration field when expiresAt is in the past', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    const pastMs = Date.now() - 3_600_000; // 1 hour ago
    const entries = [
      { slug: 'old', data: { id: 1, originalUrl: 'https://old.com', expiresAt: pastMs } as KVLinkData },
    ];

    await kvBulkPutLinks(entries);

    const body = JSON.parse(unwrap(unwrap(mockFetch.mock.calls[0])[1]).body);
    expect(body[0]).not.toHaveProperty('expiration');
  });
});

// ─── kvListKeys ─────────────────────────────────────────────────────────────

describe('kvListKeys', () => {
  beforeEach(() => mockFetch.mockReset());
  afterEach(() => clearEnv());

  it('returns empty array when KV is not configured', async () => {
    const result = await kvListKeys();
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends correct GET request and returns key names', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        result: [{ name: 'slug-a' }, { name: 'slug-b' }],
        result_info: {},
      }),
    });

    const result = await kvListKeys();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = unwrap(mockFetch.mock.calls[0]);

    expect(url).toBe(`${BASE_URL}/keys`);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-api-token',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(result).toEqual(['slug-a', 'slug-b']);
  });

  it('handles pagination via cursor', async () => {
    setEnv();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ name: 'key-1' }, { name: 'key-2' }],
          result_info: { cursor: 'cursor-abc' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ name: 'key-3' }],
          result_info: {},
        }),
      });

    const result = await kvListKeys();

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First call should not have cursor
    const [url1] = unwrap(mockFetch.mock.calls[0]);
    expect(url1).toBe(`${BASE_URL}/keys`);

    // Second call should have cursor
    const [url2] = unwrap(mockFetch.mock.calls[1]);
    expect(url2).toBe(`${BASE_URL}/keys?cursor=cursor-abc`);

    expect(result).toEqual(['key-1', 'key-2', 'key-3']);
  });

  it('returns partial results on non-ok response', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await kvListKeys();

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      'KV list keys failed:',
      500,
      'Internal Server Error',
    );
    consoleSpy.mockRestore();
  });

  it('returns partial results on unsuccessful response', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        result: [],
      }),
    });

    const result = await kvListKeys();

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      'KV list keys returned unsuccessful response',
    );
    consoleSpy.mockRestore();
  });

  it('returns partial results on network error', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('network failure'));

    const result = await kvListKeys();

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      'KV list keys error:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('returns collected keys even if pagination fails midway', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ name: 'key-1' }],
          result_info: { cursor: 'next-cursor' },
        }),
      })
      .mockRejectedValueOnce(new Error('timeout'));

    const result = await kvListKeys();

    // Should return keys collected before the error
    expect(result).toEqual(['key-1']);
    consoleSpy.mockRestore();
  });
});

// ─── kvBulkDeleteLinks ──────────────────────────────────────────────────────

describe('kvBulkDeleteLinks', () => {
  beforeEach(() => mockFetch.mockReset());
  afterEach(() => clearEnv());

  it('returns zeros when KV is not configured', async () => {
    const result = await kvBulkDeleteLinks(['slug-a', 'slug-b']);
    expect(result).toEqual({ success: 0, failed: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns zeros for empty slugs array', async () => {
    setEnv();
    const result = await kvBulkDeleteLinks([]);
    expect(result).toEqual({ success: 0, failed: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends correct bulk DELETE request', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await kvBulkDeleteLinks(['slug-a', 'slug-b', 'slug-c']);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = unwrap(mockFetch.mock.calls[0]);

    expect(url).toBe(`${BASE_URL}/bulk`);
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-api-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual(['slug-a', 'slug-b', 'slug-c']);
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(result).toEqual({ success: 3, failed: 0 });
  });

  it('counts failed entries on non-ok response', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await kvBulkDeleteLinks(['a', 'b']);

    expect(result).toEqual({ success: 0, failed: 2 });
    expect(consoleSpy).toHaveBeenCalledWith(
      'KV bulk delete failed (batch 0):',
      500,
      'Internal Server Error',
    );
    consoleSpy.mockRestore();
  });

  it('counts failed entries on network error', async () => {
    setEnv();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const result = await kvBulkDeleteLinks(['x', 'y', 'z']);

    expect(result).toEqual({ success: 0, failed: 3 });
    expect(consoleSpy).toHaveBeenCalledWith(
      'KV bulk delete error (batch 0):',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});