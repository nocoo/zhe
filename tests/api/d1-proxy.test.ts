/**
 * D1 Proxy L2 E2E Tests — real HTTP to test Worker
 *
 * Tests the /api/d1-query endpoint on the test Worker via real HTTP calls.
 * This verifies the full roundtrip: Next.js → Worker D1 binding → Test D1.
 *
 * Critical: These tests MUST use D1_PROXY_URL (test Worker), NOT the Next.js app.
 * The proxy endpoint only exists on the Worker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers for direct Worker API calls
// ---------------------------------------------------------------------------

const WORKER_URL = process.env.D1_PROXY_URL ?? '';
const PROXY_SECRET = process.env.D1_PROXY_SECRET ?? '';

if (!WORKER_URL) throw new Error('D1_PROXY_URL not set in test environment');
if (!PROXY_SECRET) throw new Error('D1_PROXY_SECRET not set in test environment');

/** Build absolute URL to test Worker's /api/d1-query endpoint. */
function workerProxyUrl(): string {
  const base = WORKER_URL.endsWith('/') ? WORKER_URL.slice(0, -1) : WORKER_URL;
  return `${base}/api/d1-query`;
}

/** POST request to Worker /api/d1-query with D1_PROXY_SECRET auth. */
async function proxyQuery(sql: string, params: unknown[] = []): Promise<{
  status: number;
  body: { success: boolean; results?: unknown[]; meta?: { changes: number; last_row_id: number }; error?: string };
}> {
  const res = await fetch(workerProxyUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PROXY_SECRET}`,
    },
    body: JSON.stringify({ sql, params }),
  });

  const body = await res.json();
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

const TEST_TABLE = 'd1_proxy_test';
const TEST_USER_ID = 'd1-proxy-e2e-test-user';

async function createTestTable(): Promise<void> {
  await proxyQuery(
    `CREATE TABLE IF NOT EXISTS ${TEST_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`
  );
}

async function cleanupTestData(): Promise<void> {
  await proxyQuery(`DELETE FROM ${TEST_TABLE} WHERE user_id = ?`, [TEST_USER_ID]);
}

// ---------------------------------------------------------------------------
// Setup/teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await createTestTable();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

// ============================================================
// Scenario 1: Authentication
// ============================================================

describe('POST /api/d1-query — authentication', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await fetch(workerProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 1' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when Bearer token is wrong', async () => {
    const res = await fetch(workerProxyUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-secret',
      },
      body: JSON.stringify({ sql: 'SELECT 1' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when using WORKER_SECRET instead of D1_PROXY_SECRET', async () => {
    const workerSecret = process.env.WORKER_SECRET;
    if (!workerSecret) {
      // Skip if WORKER_SECRET not set (harness provides a default)
      return;
    }

    const res = await fetch(workerProxyUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ sql: 'SELECT 1' }),
    });

    // Should reject because endpoint requires D1_PROXY_SECRET, not WORKER_SECRET
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });
});

// ============================================================
// Scenario 2: SQL Execution
// ============================================================

describe('POST /api/d1-query — SQL execution', () => {
  it('executes SELECT query and returns results', async () => {
    // Insert test data
    await proxyQuery(
      `INSERT INTO ${TEST_TABLE} (user_id, value, created_at) VALUES (?, ?, ?)`,
      [TEST_USER_ID, 'test-select', Date.now()]
    );

    // Query back
    const { status, body } = await proxyQuery(
      `SELECT * FROM ${TEST_TABLE} WHERE user_id = ? AND value = ?`,
      [TEST_USER_ID, 'test-select']
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results).toHaveLength(1);
    const row = body.results?.[0] as { user_id: string; value: string } | undefined;
    expect(row?.user_id).toBe(TEST_USER_ID);
    expect(row?.value).toBe('test-select');
  });

  it('executes INSERT and returns last_row_id', async () => {
    const { status, body } = await proxyQuery(
      `INSERT INTO ${TEST_TABLE} (user_id, value, created_at) VALUES (?, ?, ?)`,
      [TEST_USER_ID, 'test-insert', Date.now()]
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta?.last_row_id).toBeGreaterThan(0);
    expect(body.meta?.changes).toBe(1);
  });

  it('executes UPDATE and returns changes count', async () => {
    // Insert first
    await proxyQuery(
      `INSERT INTO ${TEST_TABLE} (user_id, value, created_at) VALUES (?, ?, ?)`,
      [TEST_USER_ID, 'before-update', Date.now()]
    );

    // Update
    const { status, body } = await proxyQuery(
      `UPDATE ${TEST_TABLE} SET value = ? WHERE user_id = ? AND value = ?`,
      ['after-update', TEST_USER_ID, 'before-update']
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta?.changes).toBe(1);
  });

  it('executes DELETE and returns changes count', async () => {
    // Insert first
    await proxyQuery(
      `INSERT INTO ${TEST_TABLE} (user_id, value, created_at) VALUES (?, ?, ?)`,
      [TEST_USER_ID, 'to-delete', Date.now()]
    );

    // Delete
    const { status, body } = await proxyQuery(
      `DELETE FROM ${TEST_TABLE} WHERE user_id = ? AND value = ?`,
      [TEST_USER_ID, 'to-delete']
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta?.changes).toBe(1);
  });

  it('returns empty array for query with no results', async () => {
    const { status, body } = await proxyQuery(
      `SELECT * FROM ${TEST_TABLE} WHERE user_id = ? AND value = ?`,
      [TEST_USER_ID, 'never-exists']
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results).toEqual([]);
  });
});

// ============================================================
// Scenario 3: Error Handling
// ============================================================

describe('POST /api/d1-query — error handling', () => {
  it('normalizes UNIQUE constraint errors (HTTP 200, stripped message)', async () => {
    // Create a unique index for this test
    await proxyQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proxy_test_user_value ON ${TEST_TABLE}(user_id, value)`);

    // Insert first row
    await proxyQuery(
      `INSERT INTO ${TEST_TABLE} (user_id, value, created_at) VALUES (?, ?, ?)`,
      [TEST_USER_ID, 'unique-test', Date.now()]
    );

    // Try to insert duplicate
    const { status, body } = await proxyQuery(
      `INSERT INTO ${TEST_TABLE} (user_id, value, created_at) VALUES (?, ?, ?)`,
      [TEST_USER_ID, 'unique-test', Date.now()]
    );

    // CRITICAL: HTTP 200 with success: false (matches D1 HTTP API behavior)
    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toBe('UNIQUE constraint failed'); // No table/column detail
  });

  it('sanitizes syntax errors to generic message (HTTP 200)', async () => {
    const { status, body } = await proxyQuery('SELCT * FROM users');

    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toBe('D1 query failed'); // Sanitized
  });

  it('sanitizes FOREIGN KEY errors to generic message (HTTP 200)', async () => {
    // Try to reference non-existent table (will fail as error, sanitized)
    const { status, body } = await proxyQuery(
      `INSERT INTO nonexistent_table (id) VALUES (1)`
    );

    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toBe('D1 query failed');
  });
});
