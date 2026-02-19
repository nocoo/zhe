vi.unmock('@/lib/db/d1-client');

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeD1Query, isD1Configured } from '@/lib/db/d1-client';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const VALID_ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
  CLOUDFLARE_D1_DATABASE_ID: 'test-database-id',
  CLOUDFLARE_API_TOKEN: 'test-api-token',
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
    const [url, init] = mockFetch.mock.calls[0];

    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/test-account-id/d1/database/test-database-id/query'
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-api-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ sql, params });
  });

  it('defaults params to empty array when omitted', async () => {
    setEnv();
    mockOkResponse([]);

    await executeD1Query('SELECT 1');

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ sql: 'SELECT 1', params: [] });
  });
});

describe('isD1Configured', () => {
  afterEach(() => {
    clearEnv();
  });

  it('returns true when all env vars are set', () => {
    setEnv();
    expect(isD1Configured()).toBe(true);
  });

  it('returns false when CLOUDFLARE_ACCOUNT_ID is missing', () => {
    process.env.CLOUDFLARE_D1_DATABASE_ID = 'db-id';
    process.env.CLOUDFLARE_API_TOKEN = 'token';

    expect(isD1Configured()).toBe(false);
  });

  it('returns false when CLOUDFLARE_D1_DATABASE_ID is missing', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-id';
    process.env.CLOUDFLARE_API_TOKEN = 'token';

    expect(isD1Configured()).toBe(false);
  });

  it('returns false when CLOUDFLARE_API_TOKEN is missing', () => {
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
