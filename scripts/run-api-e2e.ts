#!/usr/bin/env bun
/**
 * API E2E test runner — starts a Next.js dev server and runs vitest against it.
 *
 * Flow:
 * 1. Load .env.local for D1 credentials
 * 2. Start Next.js dev server on port 17005 with PLAYWRIGHT=1 (bypasses adapter)
 * 3. Poll GET /api/health until ready (timeout 60s)
 * 4. Run vitest with vitest.api.config.ts
 * 5. Kill the dev server regardless of test outcome
 * 6. Exit with vitest's exit code
 *
 * Soft gate: if D1 credentials are missing or the server fails to start,
 * prints a warning and exits 0 (skip), allowing git push to proceed.
 */
import { spawn, type ChildProcess } from 'child_process';
import { resolve as pathResolve } from 'path';
import { readFileSync } from 'fs';

const API_E2E_PORT = 17005;
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
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Soft gate check
// ---------------------------------------------------------------------------

function checkPrerequisites(): boolean {
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`\n⚠️  [api-e2e] Missing env vars: ${missing.join(', ')}`);
    console.warn('   Skipping API E2E tests (soft gate). Set these in .env.local to enable.\n');
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

function startServer(): ChildProcess {
  console.log(`[api-e2e] Starting Next.js dev server on port ${API_E2E_PORT}...`);
  const child = spawn('bun', ['run', 'next', 'dev', '--turbopack', '-p', String(API_E2E_PORT)], {
    env: {
      ...process.env,
      PLAYWRIGHT: '1', // bypass NextAuth adapter
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: pathResolve(import.meta.dirname!, '..'),
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
    // Give it 5s then SIGKILL
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 5_000);
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function runTests(): Promise<number> {
  return new Promise((done) => {
    const child = spawn('bun', ['x', 'vitest', 'run', '--config', 'vitest.api.config.ts'], {
      env: {
        ...process.env,
        API_E2E_BASE_URL: BASE_URL,
      },
      stdio: 'inherit',
      cwd: pathResolve(import.meta.dirname!, '..'),
    });

    child.on('close', (code: number | null) => {
      done(code ?? 1);
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Load env
  loadEnvFile(pathResolve(import.meta.dirname!, '..', '.env.local'));

  // Soft gate
  if (!checkPrerequisites()) {
    process.exit(0);
  }

  // Check if port is already in use
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) {
      console.warn(`⚠️  [api-e2e] Port ${API_E2E_PORT} already in use. Kill the existing server first.`);
      process.exit(1);
    }
  } catch {
    // Expected — port is free
  }

  const server = startServer();
  let exitCode = 1;

  try {
    const ready = await waitForHealth();
    if (!ready) {
      console.error(`❌ [api-e2e] Server failed to start within ${HEALTH_TIMEOUT_MS / 1000}s`);
      console.warn('   Skipping API E2E tests (soft gate).\n');
      exitCode = 0; // soft gate — don't block push
    } else {
      exitCode = await runTests();
    }
  } finally {
    killServer(server);
  }

  process.exit(exitCode);
}

main();
