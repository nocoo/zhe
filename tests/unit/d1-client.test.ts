// @vitest-environment node
vi.unmock('@/lib/db/d1-client');

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeD1Query, executeD1Batch, isD1Configured } from '@/lib/db/d1-client';
import { unwrap } from '../test-utils';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const VALID_PROXY_ENV = {
  D1_PROXY_URL: 'https://zhe-edge-test.workers.dev',
  D1_PROXY_SECRET: 'test-d1-proxy-secret',
};

function setProxyEnv(overrides: Partial<typeof VALID_PROXY_ENV> = {}) {
  const env = { ...VALID_PROXY_ENV, ...overrides };
  process.env.D1_PROXY_URL = env.D1_PROXY_URL;
  process.env.D1_PROXY_SECRET = env.D1_PROXY_SECRET;
}

function clearEnv() {
  delete process.env.D1_PROXY_URL;
  delete process.env.D1_PROXY_SECRET;
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

describe('executeD1Query', () => {
  beforeEach(() => {
    // Clear env vars from .env.local that vitest may have loaded
    clearEnv();
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearEnv();
  });

  it('throws when D1_PROXY_URL is missing', async () => {
    process.env.D1_PROXY_SECRET = 'secret';

    await expect(executeD1Query('SELECT 1')).rejects.toThrow(
      'D1 proxy not configured'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when D1_PROXY_SECRET is missing', async () => {
    process.env.D1_PROXY_URL = 'https://example.com';

    await expect(executeD1Query('SELECT 1')).rejects.toThrow(
      'D1 proxy not configured'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when all credentials are missing', async () => {
    await expect(executeD1Query('SELECT 1')).rejects.toThrow(
      'D1 proxy not configured'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends correct URL and headers', async () => {
    setProxyEnv();
    mockProxyResponse([{ id: 1, name: 'test' }]);

    await executeD1Query('SELECT 1');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = unwrap(mockFetch.mock.calls[0]);

    expect(url).toBe('https://zhe-edge-test.workers.dev/api/d1-query');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-d1-proxy-secret');
    expect(init.headers['Content-Type']).toBe('application/json');
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

  it('throws "UNIQUE constraint failed" for proxy UNIQUE errors', async () => {
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

  it('defaults params to empty array when params omitted', async () => {
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

  it('throws fallback "D1 query failed" when data.error is undefined', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });

    await expect(executeD1Query('SELECT 1')).rejects.toThrow('D1 query failed');
    consoleSpy.mockRestore();
  });

  it('returns empty array when data.results is undefined', async () => {
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const data = await executeD1Query('SELECT 1');
    expect(data).toEqual([]);
  });

  it('throws when fetch times out via AbortSignal', async () => {
    setProxyEnv();
    mockFetch.mockImplementationOnce(
      (_url: string, init: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          const error = new DOMException('The operation was aborted.', 'TimeoutError');
          if (init?.signal) {
            init.signal.addEventListener('abort', () => reject(error));
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

describe('executeD1Batch', () => {
  beforeEach(() => {
    clearEnv();
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearEnv();
  });

  it('returns empty array for empty statements', async () => {
    const result = await executeD1Batch([]);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends correct URL and headers', async () => {
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        results: [{ results: [{ id: 1 }], meta: { changes: 1, last_row_id: 1 } }],
      }),
    });

    await executeD1Batch([{ sql: 'INSERT INTO t VALUES (?)', params: [1] }]);

    const [url, init] = unwrap(mockFetch.mock.calls[0]);
    expect(url).toBe('https://zhe-edge-test.workers.dev/api/d1-batch');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-d1-proxy-secret');
  });

  it('handles proxy URL with trailing slash', async () => {
    setProxyEnv({ D1_PROXY_URL: 'https://zhe-edge-test.workers.dev/' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, results: [] }),
    });

    await executeD1Batch([{ sql: 'SELECT 1' }]);

    const [url] = unwrap(mockFetch.mock.calls[0]);
    expect(url).toBe('https://zhe-edge-test.workers.dev/api/d1-batch');
  });

  it('returns mapped results from batch response', async () => {
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        results: [
          { results: [{ id: 1 }], meta: { changes: 1, last_row_id: 1 } },
          { results: [{ id: 2 }, { id: 3 }], meta: { changes: 0, last_row_id: 0 } },
        ],
      }),
    });

    const data = await executeD1Batch([
      { sql: 'INSERT INTO t VALUES (?)', params: [1] },
      { sql: 'SELECT * FROM t' },
    ]);

    expect(data).toEqual([[{ id: 1 }], [{ id: 2 }, { id: 3 }]]);
  });

  it('throws on HTTP error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(executeD1Batch([{ sql: 'SELECT 1' }])).rejects.toThrow('D1 batch failed');
    consoleSpy.mockRestore();
  });

  it('throws on batch query error with message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: 'FOREIGN KEY constraint failed' }),
    });

    await expect(executeD1Batch([{ sql: 'DELETE FROM t' }])).rejects.toThrow('FOREIGN KEY constraint failed');
    consoleSpy.mockRestore();
  });

  it('throws fallback "D1 batch failed" when data.error is undefined', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });

    await expect(executeD1Batch([{ sql: 'SELECT 1' }])).rejects.toThrow('D1 batch failed');
    consoleSpy.mockRestore();
  });

  it('returns empty array when data.results is undefined', async () => {
    setProxyEnv();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const data = await executeD1Batch([{ sql: 'SELECT 1' }]);
    expect(data).toEqual([]);
  });

  it('throws when credentials are missing', async () => {
    await expect(executeD1Batch([{ sql: 'SELECT 1' }])).rejects.toThrow('D1 proxy not configured');
  });
});

describe('retry on transient errors', () => {
  beforeEach(() => {
    clearEnv();
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearEnv();
  });

  it('retries on "fetch failed" TypeError and succeeds', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setProxyEnv();

    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    mockProxyResponse([{ id: 1 }]);

    const result = await executeD1Query('SELECT 1');

    expect(result).toEqual([{ id: 1 }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it('does not retry on non-transient errors', async () => {
    setProxyEnv();
    mockFetch.mockRejectedValueOnce(new Error('some other error'));

    await expect(executeD1Query('SELECT 1')).rejects.toThrow('some other error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after max retries', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setProxyEnv();

    const err = new TypeError('fetch failed');
    mockFetch.mockRejectedValueOnce(err);
    mockFetch.mockRejectedValueOnce(err);
    mockFetch.mockRejectedValueOnce(err);

    await expect(executeD1Query('SELECT 1')).rejects.toThrow('fetch failed');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    consoleSpy.mockRestore();
  });

  it('retries batch requests on transient errors', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setProxyEnv();

    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        results: [{ results: [{ id: 1 }], meta: { changes: 1, last_row_id: 1 } }],
      }),
    });

    const result = await executeD1Batch([{ sql: 'INSERT INTO t VALUES (?)', params: [1] }]);

    expect(result).toEqual([[{ id: 1 }]]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it('does not retry AbortError (timeout)', async () => {
    setProxyEnv();
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

    await expect(executeD1Query('SELECT 1')).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('isD1Configured', () => {
  beforeEach(() => {
    // Clear env vars from .env.local that vitest may have loaded
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
  });

  it('returns true when proxy credentials are set', () => {
    setProxyEnv();
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

  it('returns false when all env vars are missing', () => {
    expect(isD1Configured()).toBe(false);
  });

  it('returns false when env vars are empty strings', () => {
    process.env.D1_PROXY_URL = '';
    process.env.D1_PROXY_SECRET = '';
    expect(isD1Configured()).toBe(false);
  });
});