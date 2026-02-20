/**
 * Shared fixtures and helpers for Playwright E2E tests.
 *
 * Tests run against the real Next.js server with real D1 database.
 * Auth uses a Credentials provider (PLAYWRIGHT=1) to bypass Google OAuth.
 * The test user "e2e-test-user-id" has its own scoped data in D1.
 */
import { test, expect } from '@playwright/test';

export { test, expect };
