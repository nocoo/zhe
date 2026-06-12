#!/usr/bin/env bun
/**
 * API E2E test runner — runs all L2 tests via real HTTP against a fully
 * local stack (wrangler dev + Miniflare D1/KV + filesystem R2 shim).
 *
 * No remote Cloudflare resources are required — `wrangler whoami` may report
 * "not logged in" and the tests still pass. See scripts/test-stack.ts.
 */
import { spawn, type ChildProcess } from 'child_process';
import { resolve as pathResolve } from 'path';
import {
  startLocalStack,
  stopLocalStack,
  applyLocalStackEnv,
  loadEnvFile,
  WORKER_URL,
  D1_PROXY_SECRET,
  type LocalStack,
} from './test-stack';

const PROJECT_ROOT = process.cwd();
const API_E2E_PORT = 17006;
const BASE_URL = `http://localhost:${API_E2E_PORT}`;
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 100;

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
// _test_marker verification (against local stack)
// ---------------------------------------------------------------------------

async function verifyTestMarker(): Promise<boolean> {
  const res = await fetch(`${WORKER_URL}/api/d1-query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${D1_PROXY_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql: "SELECT value FROM _test_marker WHERE key = 'env'", params: [] }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean; results?: Array<{ value: string }> };
  return data.success && data.results?.[0]?.value === 'test';
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvFile(pathResolve(PROJECT_ROOT, '.env.local'));

  console.log('\n━━━ L2: Real HTTP API E2E tests (local stack) ━━━\n');

  // Port-busy check before spawning anything heavy
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) {
      console.warn(`⚠️  [api-e2e] Port ${API_E2E_PORT} already in use. Kill the existing server first.`);
      process.exit(1);
    }
  } catch {
    // expected — port is free
  }

  let stack: LocalStack | null = null;
  let server: ChildProcess | null = null;
  let exitCode = 1;
  try {
    stack = await startLocalStack();
    applyLocalStackEnv();

    if (!(await verifyTestMarker())) {
      throw new Error('_test_marker check failed against the local stack — migrations may not have applied.');
    }

    // Auth needs SOMETHING — keep a stable test secret so /api/cron/* signed
    // routes can be exercised by the test suite.
    if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = 'api-e2e-test-auth-secret';

    server = startServer();
    const ready = await waitForHealth();
    if (!ready) {
      throw new Error(`Server failed to start within ${HEALTH_TIMEOUT_MS / 1000}s`);
    }
    exitCode = await runHttpTests();
  } catch (err) {
    console.error(`❌ [api-e2e] ${err instanceof Error ? err.message : String(err)}`);
    exitCode = 1;
  } finally {
    if (server) killServer(server);
    if (stack) await stopLocalStack(stack);
  }

  process.exit(exitCode);
}

main();
