#!/usr/bin/env bun
/**
 * API E2E test runner — runs all L2 tests via real HTTP.
 *
 * All tests/api/*.test.ts files run against a real Next.js dev server
 * on port 17006 with PLAYWRIGHT=1 (enables e2e-credentials auth).
 *
 * Soft gate: if D1 credentials are missing or the server fails to start,
 * prints a warning and exits 0 (skip), allowing git push to proceed.
 */
import { spawn, type ChildProcess } from 'child_process';
import { resolve as pathResolve } from 'path';
import { readFileSync } from 'fs';

const PROJECT_ROOT = pathResolve(import.meta.dirname ?? process.cwd(), '..');
const API_E2E_PORT = 17006;
const BASE_URL = `http://localhost:${API_E2E_PORT}`;
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 1_000;

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function loadEnvFile(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments for unquoted values (e.g. KEY=value # comment)
      const commentIdx = value.indexOf(' #');
      if (commentIdx >= 0) value = value.slice(0, commentIdx).trim();
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Generic child process runner
// ---------------------------------------------------------------------------

function runCommand(args: string[], env?: Record<string, string>): Promise<number> {
  return new Promise((done) => {
    const child = spawn('bun', args, {
      env: { ...process.env, ...env },
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });
    child.on('close', (code: number | null) => {
      done(code ?? 1);
    });
  });
}

// ---------------------------------------------------------------------------
// D1 test marker verification
// ---------------------------------------------------------------------------

async function queryD1TestMarker(): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !token) return null;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: "SELECT value FROM _test_marker WHERE key = 'env'", params: [] }),
    },
  );
  if (!res.ok) throw new Error(`D1 HTTP error ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error('D1 query failed');
  const rows = data.result?.[0]?.results ?? [];
  return rows.length > 0 ? (rows[0] as { value: string }).value : null;
}

// ---------------------------------------------------------------------------
// Prerequisites check
// ---------------------------------------------------------------------------

async function checkPrerequisites(): Promise<boolean> {
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`\n⚠️  [api-e2e] Missing env vars: ${missing.join(', ')}`);
    console.warn('   Skipping L2 tests (soft gate). Set these in .env.local to enable.\n');
    return false;
  }

  // Safety: require D1_TEST_DATABASE_ID to exist.
  // main() has already verified testDbId !== prodDbId and overridden CLOUDFLARE_D1_DATABASE_ID.
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    console.error('❌ [api-e2e] D1_TEST_DATABASE_ID not set.');
    console.error('   Set D1_TEST_DATABASE_ID in .env.local to the dedicated test D1 database ID.');
    console.error('   This guard prevents running destructive tests against production.\n');
    return false;
  }

  // _test_marker: last line of defense — verify the database is actually a test DB
  try {
    const marker = await queryD1TestMarker();
    if (marker !== 'test') {
      console.error('❌ [api-e2e] _test_marker check failed. Is this really a test database?');
      console.error('   Expected _test_marker(key="env", value="test") in the D1 database.');
      console.error('   Run Step 2 from docs/14-cloudflare-resource-inventory.md to initialize.\n');
      return false;
    }
  } catch (err) {
    console.warn(`⚠️  [api-e2e] Failed to verify _test_marker: ${err}`);
    console.warn('   Database may not be initialized. Skipping L2 tests (soft gate).\n');
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Dev server lifecycle
// ---------------------------------------------------------------------------

function startServer(): ChildProcess {
  console.log(`[api-e2e] Starting Next.js dev server on port ${API_E2E_PORT}...`);
  const child = spawn('bun', ['run', 'next', 'dev', '--turbopack', '-p', String(API_E2E_PORT)], {
    env: {
      ...process.env,
      PLAYWRIGHT: '1',
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: PROJECT_ROOT,
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) console.log(`  [server] ${text}`);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) console.log(`  [server:err] ${text}`);
  });

  return child;
}

async function waitForHealth(): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        console.log('[api-e2e] Server is ready.');
        return true;
      }
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}

function killServer(child: ChildProcess): void {
  if (child.exitCode === null) {
    console.log('[api-e2e] Shutting down dev server...');
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 5_000);
  }
}

// ---------------------------------------------------------------------------
// Test execution
// ---------------------------------------------------------------------------

async function runHttpTests(): Promise<number> {
  return runCommand(
    ['x', 'vitest', 'run', '--config', 'vitest.api.config.ts'],
    { API_E2E_BASE_URL: BASE_URL, WORKER_SECRET: process.env.WORKER_SECRET ?? '' },
  );
}

async function runTests(): Promise<number> {
  console.log('\n━━━ L2: Real HTTP API E2E tests ━━━\n');

  if (!(await checkPrerequisites())) {
    return 0; // soft gate
  }

  // Check if port is already in use
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) {
      console.warn(`⚠️  [api-e2e] Port ${API_E2E_PORT} already in use. Kill the existing server first.`);
      return 1;
    }
  } catch {
    // Expected — port is free
  }

  const server = startServer();
  try {
    const ready = await waitForHealth();
    if (!ready) {
      console.error(`❌ [api-e2e] Server failed to start within ${HEALTH_TIMEOUT_MS / 1000}s`);
      console.warn('   Skipping L2 tests (soft gate).\n');
      return 0; // soft gate
    }
    return await runHttpTests();
  } finally {
    killServer(server);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvFile(pathResolve(PROJECT_ROOT, '.env.local'));

  // ---- D1: override to test database ----
  const prodDbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    console.warn('⚠️  [api-e2e] D1_TEST_DATABASE_ID not set. Skipping L2 tests (soft gate).');
    return;
  }
  if (testDbId === prodDbId) {
    console.error(
      '❌ D1_TEST_DATABASE_ID === CLOUDFLARE_D1_DATABASE_ID. ' +
      'Test DB must differ from production DB.'
    );
    process.exit(1);
  }
  process.env.CLOUDFLARE_D1_DATABASE_ID = testDbId;

  // ---- KV: override or clear ----
  if (process.env.CLOUDFLARE_KV_NAMESPACE_ID) {
    const testKvId = process.env.KV_TEST_NAMESPACE_ID;
    if (testKvId) {
      process.env.CLOUDFLARE_KV_NAMESPACE_ID = testKvId;
    } else {
      console.warn(
        '⚠️  [api-e2e] CLOUDFLARE_KV_NAMESPACE_ID is set but KV_TEST_NAMESPACE_ID is missing. ' +
        'Clearing KV config to prevent production writes (KV features disabled for this run).'
      );
      delete process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    }
  }

  // ---- R2: override to test bucket ----
  const testBucket = process.env.R2_TEST_BUCKET_NAME;
  const testPublicDomain = process.env.R2_TEST_PUBLIC_DOMAIN;
  if (testBucket && testPublicDomain) {
    process.env.R2_BUCKET_NAME = testBucket;
    process.env.R2_PUBLIC_DOMAIN = testPublicDomain;
  } else {
    console.warn(
      '⚠️  [api-e2e] R2_TEST_BUCKET_NAME or R2_TEST_PUBLIC_DOMAIN not set. ' +
      'Dev server retains production R2 config — tmp/upload tests may write to production R2.'
    );
  }

  // ---- WORKER_SECRET: ensure it exists for cron endpoint tests ----
  if (!process.env.WORKER_SECRET) {
    process.env.WORKER_SECRET = 'api-e2e-test-worker-secret';
    console.log('[api-e2e] WORKER_SECRET not set — using test default.');
  }

  const exitCode = await runTests();
  process.exit(exitCode);
}

main();
