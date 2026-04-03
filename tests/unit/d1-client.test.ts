vi.unmock('@/lib/db/d1-client');

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeD1Query, isD1Configured } from '@/lib/db/d1-client';
import { unwrap } from '../test-utils';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const VALID_ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
  CLOUDFLARE_D1_DATABASE_ID: 'test-database-id',
  CLOUDFLARE_API_TOKEN: 'test-api-token',
};

const VALID_PROXY_ENV = {
  D1_PROXY_URL: 'https://zhe-edge-test.workers.dev',
  D1_PROXY_SECRET: 'test-d1-proxy-secret',
};

function setEnv(overrides: Partial<typeof VALID_ENV> = {}) {
  const env = { ...VALID_ENV, ...overrides };
  process.env.CLOUDFLARE_ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_D1_DATABASE_ID = env.CLOUDFLARE_D1_DATABASE_ID;
  process.env.CLOUDFLARE_API_TOKEN = env.CLOUDFLARE_API_TOKEN;
}

function clearEnv() {
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_D1_DATABASE_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.D1_PROXY_URL;
  delete process.env.D1_PROXY_SECRET;
}

function mockOkResponse<T>(results: T[], success = true) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      success,
      result: [{ results }],
      errors: [],
    }),
  });
}

describe('executeD1Query', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearEnv();
  });

  it('throws when CLOUDFLARE_ACCOUNT_ID is missing', async () => {
    process.env.CLOUDFLARE_D1_DATABASE_ID = 'db-id';
    process.env.CLOUDFLARE_API_TOKEN = 'token';

    await expect(executeD1Query('SELECT 1')).rejects.toThrow(
      'D1 credentials not configured'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when CLOUDFLARE_D1_DATABASE_ID is missing', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-id';
    process.env.CLOUDFLARE_API_TOKEN = 'token';

    await expect(executeD1Query('SELECT 1')).rejects.toThrow(
      'D1 credentials not configured'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when CLOUDFLARE_API_TOKEN is missing', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-id';
    process.env.CLOUDFLARE_D1_DATABASE_ID = 'db-id';

    await expect(executeD1Query('SELECT 1')).rejects.toThrow(
      'D1 credentials not configured'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when all credentials are missing', async () => {
    await expect(executeD1Query('SELECT 1')).rejects.toThrow(
      'D1 credentials not configured'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns results on successful query', async () => {
    setEnv();
    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];
    mockOkResponse(rows);

    const result = await executeD1Query('SELECT * FROM users');

    expect(result).toEqual(rows);
  });

  it('throws sanitized error when response is not ok', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => 'Unauthorized: bad token',
    });

    await expect(
      executeD1Query('SELECT * FROM users')
    ).rejects.toThrow('D1 query failed');
  });

  it('throws sanitized error when data.success is false', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        result: [],
        errors: [
          { message: 'syntax error' },
          { message: 'near SELCT' },
        ],
      }),
    });

    await expect(
      executeD1Query('SELCT * FROM users')
    ).rejects.toThrow('D1 query failed');
  });

  it('preserves UNIQUE constraint errors for caller detection', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        result: [],
        errors: [{ message: 'UNIQUE constraint failed: links.slug' }],
      }),
    });

    await expect(
      executeD1Query('INSERT INTO links ...')
    ).rejects.toThrow('UNIQUE constraint failed');
  });

  it('returns empty array when result set is empty', async () => {
    setEnv();
    mockOkResponse([]);

    const result = await executeD1Query(
      'SELECT * FROM users WHERE id = ?',
      [999]
    );

    expect(result).toEqual([]);
  });

  it('returns empty array when result[0] is undefined', async () => {
    setEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        result: [],
        errors: [],
      }),
    });

    const result = await executeD1Query('SELECT * FROM users');

    expect(result).toEqual([]);
  });

  it('sends correct URL, headers, and body', async () => {
    setEnv();
    mockOkResponse([]);

    const sql = 'INSERT INTO users (name) VALUES (?)';
    const params = ['Charlie'];

    await executeD1Query(sql, params);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = unwrap(mockFetch.mock.calls[0]);

    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/test-account-id/d1/database/test-database-id/query'
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-api-token',
      'Content-Type': 'application/json',
      Connection: 'keep-alive',
    });
    expect(JSON.parse(init.body)).toEqual({ sql, params });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('defaults params to empty array when omitted', async () => {
    setEnv();
    mockOkResponse([]);

    await executeD1Query('SELECT 1');

    const [, init] = unwrap(mockFetch.mock.calls[0]);
    expect(JSON.parse(init.body)).toEqual({ sql: 'SELECT 1', params: [] });
  });

  it('throws when fetch times out via AbortSignal', async () => {
    setEnv();
    mockFetch.mockImplementationOnce(
      (_url: string, init: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          // Simulate an abort triggered by AbortSignal.timeout
          const error = new DOMException('The operation was aborted.', 'TimeoutError');
          if (init?.signal) {
            init.signal.addEventListener('abort', () => reject(error));
            // Manually abort to simulate timeout
            setTimeout(() => {
              if (!unwrap(init.signal).aborted) {
                reject(error);
              }
            }, 10);
          }
        });
      }
    );

    await expect(executeD1Query('SELECT 1')).rejects.toThrow();
  });
});

describe('executeD1Query — Worker proxy path', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearEnv();
  });

  function setProxyEnv(overrides: Partial<typeof VALID_PROXY_ENV> = {}) {
    const env = { ...VALID_PROXY_ENV, ...overrides };
    process.env.D1_PROXY_URL = env.D1_PROXY_URL;
    process.env.D1_PROXY_SECRET = env.D1_PROXY_SECRET;
  }

  function mockProxyResponse<T>(results: T[], success = true, error?: string) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success,
        results,
        meta: { changes: 0, last_row_id: 0 },
        error,
      }),
    });
  }

  it('uses proxy path when D1_PROXY_URL and D1_PROXY_SECRET are set', async () => {
    setProxyEnv();
    mockProxyResponse([{ id: 1, name: 'test' }]);

    await executeD1Query('SELECT 1');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = unwrap(mockFetch.mock.calls[0]);

    expect(url).toBe('https://zhe-edge-test.workers.dev/api/d1-query');
    expect(init.method).toBe('POST');
  });

  it('sends D1_PROXY_SECRET in Authorization header (NOT WORKER_SECRET)', async () => {
    setProxyEnv();
    mockProxyResponse([]);

    await executeD1Query('SELECT 1');

    const [, init] = unwrap(mockFetch.mock.calls[0]);
    expect(init.headers.Authorization).toBe('Bearer test-d1-proxy-secret');
  });

  it('sends correct request body format with sql and params', async () => {
    setProxyEnv();
    mockProxyResponse([]);

    const sql = 'SELECT * FROM users WHERE id = ?';
    const params = [42];

    await executeD1Query(sql, params);

    const [, init] = unwrap(mockFetch.mock.calls[0]);
    expect(JSON.parse(init.body)).toEqual({ sql, params });
  });

  it('returns results from proxy response', async () => {
    setProxyEnv();
    const results = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ];
    mockProxyResponse(results);

    const data = await executeD1Query<{ id: number; name: string; email: string }>(
      'SELECT * FROM users'
    );

    expect(data).toEqual(results);
  });

  it('returns empty array when proxy returns no results', async () => {
    setProxyEnv();
    mockProxyResponse([]);

    const data = await executeD1Query('SELECT * FROM users WHERE id = ?', [999]);

    expect(data).toEqual([]);
  });

  it('throws "UNIQUE constraint failed" for proxy UNIQUE errors (HTTP 200)', async () => {
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        error: 'UNIQUE constraint failed',
      }),
    });

    await expect(
      executeD1Query('INSERT INTO users (email) VALUES (?)', ['dup@example.com'])
    ).rejects.toThrow('UNIQUE constraint failed');
  });

  it('throws "D1 query failed" for proxy syntax errors (sanitized)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        error: 'D1 query failed',
      }),
    });

    await expect(
      executeD1Query('SELEC * FROM users')
    ).rejects.toThrow('D1 query failed');
    consoleSpy.mockRestore();
  });

  it('throws "D1 query failed" for proxy HTTP errors (non-2xx)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(executeD1Query('SELECT 1')).rejects.toThrow('D1 query failed');
    consoleSpy.mockRestore();
  });

  it('defaults params to empty array when proxy configured but params omitted', async () => {
    setProxyEnv();
    mockProxyResponse([]);

    await executeD1Query('SELECT 1');

    const [, init] = unwrap(mockFetch.mock.calls[0]);
    expect(JSON.parse(init.body)).toEqual({ sql: 'SELECT 1', params: [] });
  });

  it('handles proxy URL with trailing slash', async () => {
    setProxyEnv({ D1_PROXY_URL: 'https://zhe-edge-test.workers.dev/' });
    mockProxyResponse([]);

    await executeD1Query('SELECT 1');

    const [url] = unwrap(mockFetch.mock.calls[0]);
    expect(url).toBe('https://zhe-edge-test.workers.dev/api/d1-query');
  });

  it('falls back to HTTP API when proxy credentials are missing', async () => {
    // Set only HTTP API credentials, no proxy
    setEnv();
    // HTTP API response format (different from proxy)
    mockOkResponse([{ id: 1 }]);

    await executeD1Query('SELECT 1');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = unwrap(mockFetch.mock.calls[0]);
    expect(url).toContain('api.cloudflare.com');
  });

  it('prefers proxy path when both proxy and HTTP API credentials are set', async () => {
    setEnv(); // HTTP API credentials
    setProxyEnv(); // Proxy credentials
    mockProxyResponse([{ id: 1 }]); // Proxy response format

    await executeD1Query('SELECT 1');

    const [url] = unwrap(mockFetch.mock.calls[0]);
    expect(url).toContain('zhe-edge-test.workers.dev');
    expect(url).not.toContain('api.cloudflare.com');
  });

  it('throws "D1 credentials not configured" when neither proxy nor HTTP API configured', async () => {
    // No credentials set at all
    await expect(executeD1Query('SELECT 1')).rejects.toThrow(
      'D1 credentials not configured'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('isD1Configured', () => {
  afterEach(() => {
    clearEnv();
  });

  it('returns true when all HTTP API env vars are set', () => {
    setEnv();
    expect(isD1Configured()).toBe(true);
  });

  it('returns true when proxy credentials are set (D1_PROXY_URL + D1_PROXY_SECRET)', () => {
    process.env.D1_PROXY_URL = 'https://zhe-edge.workers.dev';
    process.env.D1_PROXY_SECRET = 'secret';

    expect(isD1Configured()).toBe(true);
  });

  it('returns true when both proxy and HTTP API credentials are set', () => {
    setEnv();
    process.env.D1_PROXY_URL = 'https://zhe-edge.workers.dev';
    process.env.D1_PROXY_SECRET = 'secret';

    expect(isD1Configured()).toBe(true);
  });

  it('returns false when only D1_PROXY_URL is set (missing SECRET)', () => {
    process.env.D1_PROXY_URL = 'https://zhe-edge.workers.dev';

    expect(isD1Configured()).toBe(false);
  });

  it('returns false when only D1_PROXY_SECRET is set (missing URL)', () => {
    process.env.D1_PROXY_SECRET = 'secret';

    expect(isD1Configured()).toBe(false);
  });

  it('returns false when CLOUDFLARE_ACCOUNT_ID is missing (HTTP API path)', () => {
    process.env.CLOUDFLARE_D1_DATABASE_ID = 'db-id';
    process.env.CLOUDFLARE_API_TOKEN = 'token';

    expect(isD1Configured()).toBe(false);
  });

  it('returns false when CLOUDFLARE_D1_DATABASE_ID is missing (HTTP API path)', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-id';
    process.env.CLOUDFLARE_API_TOKEN = 'token';

    expect(isD1Configured()).toBe(false);
  });

  it('returns false when CLOUDFLARE_API_TOKEN is missing (HTTP API path)', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-id';
    process.env.CLOUDFLARE_D1_DATABASE_ID = 'db-id';

    expect(isD1Configured()).toBe(false);
  });

  it('returns false when all env vars are missing', () => {
    expect(isD1Configured()).toBe(false);
  });

  it('returns false when env vars are empty strings', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = '';
    process.env.CLOUDFLARE_D1_DATABASE_ID = '';
    process.env.CLOUDFLARE_API_TOKEN = '';

    expect(isD1Configured()).toBe(false);
  });
});


