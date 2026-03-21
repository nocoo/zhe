#!/usr/bin/env bun
/**
 * API E2E test runner — runs all L2 route handler tests in two phases:
 *
 * Phase 1: In-process route handler tests (vi.mock-based, no server needed)
 *   - Runs: tests/api/*.test.ts EXCEPT api.test.ts and live.test.ts
 *   - Uses: main vitest.config.ts (jsdom + setup.ts D1 memory mock)
 *
 * Phase 2: Real HTTP tests (fetch against running Next.js dev server)
 *   - Runs: tests/api/api.test.ts and tests/api/live.test.ts
 *   - Uses: vitest.api.config.ts (node, no setup.ts)
 *   - Starts dev server on port 17005, polls health, runs tests, kills server
 *
 * Soft gate: if D1 credentials are missing or the server fails to start,
 * Phase 2 prints a warning and exits 0 (skip), allowing git push to proceed.
 * Phase 1 (in-process) always runs — it has no external dependencies.
 */
import { spawn, type ChildProcess } from 'child_process';
import { resolve as pathResolve } from 'path';
import { readFileSync } from 'fs';

const PROJECT_ROOT = pathResolve(import.meta.dirname!, '..');
const API_E2E_PORT = 17005;
const BASE_URL = `http://localhost:${API_E2E_PORT}`;
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 1_000;

// Real HTTP test files — everything else in tests/api/ is in-process
const HTTP_TEST_FILES = ['tests/api/api.test.ts', 'tests/api/live.test.ts'];

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
// Phase 1: In-process route handler tests
// ---------------------------------------------------------------------------

async function runInProcessTests(): Promise<number> {
  console.log('\n━━━ Phase 1: In-process route handler tests ━━━\n');

  const excludeArgs = HTTP_TEST_FILES.flatMap((f) => ['--exclude', f]);

  return runCommand([
    'x', 'vitest', 'run', 'tests/api',
    ...excludeArgs,
  ]);
}

// ---------------------------------------------------------------------------
// Phase 2: Real HTTP tests
// ---------------------------------------------------------------------------

function checkPrerequisites(): boolean {
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`\n⚠️  [api-e2e] Missing env vars: ${missing.join(', ')}`);
    console.warn('   Skipping real HTTP tests (soft gate). Set these in .env.local to enable.\n');
    return false;
  }

  // Safety: require D1_TEST_DATABASE_ID to match CLOUDFLARE_D1_DATABASE_ID.
  // This prevents accidentally running destructive E2E tests against a
  // production or shared development database.
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  const activeDbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  if (!testDbId) {
    console.error('❌ [api-e2e] D1_TEST_DATABASE_ID not set.');
    console.error('   Set D1_TEST_DATABASE_ID in .env.local to the D1 database ID used for testing.');
    console.error('   This guard prevents running destructive tests against production.\n');
    return false;
  }
  if (testDbId !== activeDbId) {
    console.error('❌ [api-e2e] D1 safety check failed:');
    console.error(`   CLOUDFLARE_D1_DATABASE_ID = ${activeDbId}`);
    console.error(`   D1_TEST_DATABASE_ID        = ${testDbId}`);
    console.error('   These must match. Refusing to run tests against a non-test database.\n');
    return false;
  }

  return true;
}

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

async function runHttpTests(): Promise<number> {
  return runCommand(
    ['x', 'vitest', 'run', '--config', 'vitest.api.config.ts'],
    { API_E2E_BASE_URL: BASE_URL },
  );
}

async function runPhase2(): Promise<number> {
  console.log('\n━━━ Phase 2: Real HTTP tests ━━━\n');

  if (!checkPrerequisites()) {
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
      console.warn('   Skipping real HTTP tests (soft gate).\n');
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

  // Phase 1: always runs (no external deps)
  const phase1Code = await runInProcessTests();
  if (phase1Code !== 0) {
    process.exit(phase1Code);
  }

  // Phase 2: soft gate (may skip if infra unavailable)
  const phase2Code = await runPhase2();
  process.exit(phase2Code);
}

main();
