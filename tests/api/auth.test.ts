/**
 * L2 API E2E Tests for /api/auth/[...nextauth]
 *
 * Tests the NextAuth.js endpoints via real HTTP.
 * Validates CSRF token endpoint, providers list, and e2e-credentials login flow.
 *
 * The dev server runs with PLAYWRIGHT=1, which enables the e2e-credentials
 * provider alongside Google OAuth.
 */
import { describe, it, expect } from 'vitest';
import { apiGet, jsonResponse } from './helpers/http';

describe('GET /api/auth', () => {
  it('GET /api/auth/csrf returns a csrfToken', async () => {
    const res = await apiGet('/api/auth/csrf');
    const { status, body } = await jsonResponse<{ csrfToken: string }>(res);

    expect(status).toBe(200);
    expect(body.csrfToken).toBeDefined();
    expect(typeof body.csrfToken).toBe('string');
    expect(body.csrfToken.length).toBeGreaterThan(0);
  });

  it('GET /api/auth/providers lists available providers including e2e-credentials', async () => {
    const res = await apiGet('/api/auth/providers');
    const { status, body } = await jsonResponse<Record<string, {
      id: string;
      name: string;
      type: string;
      signinUrl: string;
    }>>(res);

    expect(status).toBe(200);

    // Google should always be present
    expect(body.google).toBeDefined();
    expect(body.google.id).toBe('google');
    expect(body.google.type).toBe('oidc');

    // e2e-credentials should be present because dev server runs with PLAYWRIGHT=1
    expect(body['e2e-credentials']).toBeDefined();
    expect(body['e2e-credentials'].id).toBe('e2e-credentials');
    expect(body['e2e-credentials'].type).toBe('credentials');
  });

  it('GET /api/auth/session returns empty/null session for unauthenticated request', async () => {
    const res = await apiGet('/api/auth/session');

    expect(res.status).toBe(200);
    const body = await res.json();
    // NextAuth returns null or {} for unauthenticated sessions depending on version
    const isEmpty = body === null || (typeof body === 'object' && Object.keys(body).length === 0);
    expect(isEmpty).toBe(true);
  });
});
