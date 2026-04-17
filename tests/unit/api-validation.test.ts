import { describe, it, expect } from 'vitest';
import { parsePaginationParams, parseJsonBody, isErrorResponse, validateUrl } from '@/lib/api/validation';
import { NextResponse } from 'next/server';

describe('parsePaginationParams', () => {
  it('returns defaults when no params provided', () => {
    const url = new URL('https://example.com/api');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(false);
    if (!isErrorResponse(result)) {
      expect(result.limit).toBe(100);
      expect(result.offset).toBe(0);
    }
  });

  it('parses valid limit and offset', () => {
    const url = new URL('https://example.com/api?limit=50&offset=10');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(false);
    if (!isErrorResponse(result)) {
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    }
  });

  it('caps limit at maxLimit', () => {
    const url = new URL('https://example.com/api?limit=1000');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(false);
    if (!isErrorResponse(result)) {
      expect(result.limit).toBe(500);
    }
  });

  it('uses custom maxLimit and defaultLimit', () => {
    const url = new URL('https://example.com/api?limit=100');
    const result = parsePaginationParams(url, { maxLimit: 50, defaultLimit: 20 });

    expect(isErrorResponse(result)).toBe(false);
    if (!isErrorResponse(result)) {
      expect(result.limit).toBe(50); // capped at maxLimit
    }
  });

  it('returns error for negative limit', () => {
    const url = new URL('https://example.com/api?limit=-1');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for non-numeric limit', () => {
    const url = new URL('https://example.com/api?limit=abc');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for negative offset', () => {
    const url = new URL('https://example.com/api?offset=-5');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for non-numeric offset', () => {
    const url = new URL('https://example.com/api?offset=xyz');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for float limit', () => {
    const url = new URL('https://example.com/api?limit=1.5');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for float offset', () => {
    const url = new URL('https://example.com/api?offset=2.7');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for limit with trailing characters', () => {
    const url = new URL('https://example.com/api?limit=10abc');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for offset with trailing characters', () => {
    const url = new URL('https://example.com/api?offset=5xyz');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for empty limit string', () => {
    const url = new URL('https://example.com/api?limit=');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for empty offset string', () => {
    const url = new URL('https://example.com/api?offset=');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for whitespace-only limit', () => {
    const url = new URL('https://example.com/api?limit=%20');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for scientific notation limit (1e2)', () => {
    const url = new URL('https://example.com/api?limit=1e2');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for hex limit (0x10)', () => {
    const url = new URL('https://example.com/api?limit=0x10');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for leading zeros (007)', () => {
    const url = new URL('https://example.com/api?limit=007');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('accepts zero as valid limit', () => {
    const url = new URL('https://example.com/api?limit=0');
    const result = parsePaginationParams(url);

    expect(isErrorResponse(result)).toBe(false);
    if (!isErrorResponse(result)) {
      expect(result.limit).toBe(0);
    }
  });
});

describe('parseJsonBody', () => {
  it('parses valid JSON object', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar', num: 42 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseJsonBody(request);

    expect(isErrorResponse(result)).toBe(false);
    if (!isErrorResponse(result)) {
      expect(result.foo).toBe('bar');
      expect(result.num).toBe(42);
    }
  });

  it('returns error for invalid JSON', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: '{invalid json',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseJsonBody(request);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for null body', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: 'null',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseJsonBody(request);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for array body', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify([1, 2, 3]),
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseJsonBody(request);

    expect(isErrorResponse(result)).toBe(true);
  });

  it('returns error for primitive body', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: '"just a string"',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseJsonBody(request);

    expect(isErrorResponse(result)).toBe(true);
  });
});

describe('isErrorResponse', () => {
  it('returns true for NextResponse', () => {
    const response = NextResponse.json({ error: 'test' }, { status: 400 });
    expect(isErrorResponse(response)).toBe(true);
  });

  it('returns false for plain object', () => {
    expect(isErrorResponse({ limit: 10, offset: 0 })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isErrorResponse(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isErrorResponse(undefined)).toBe(false);
  });
});

describe('validateUrl', () => {
  it('returns parsed URL for valid https URL', () => {
    const result = validateUrl('https://example.com/path?query=1');
    expect(result).toBeInstanceOf(URL);
    if (result instanceof URL) {
      expect(result.hostname).toBe('example.com');
      expect(result.pathname).toBe('/path');
    }
  });

  it('returns parsed URL for valid http URL', () => {
    const result = validateUrl('http://example.com');
    expect(result).toBeInstanceOf(URL);
  });

  it('returns error for invalid URL', () => {
    const result = validateUrl('not-a-url');
    expect(result).toBe('Invalid URL');
  });

  it('returns error for javascript: protocol', () => {
    const result = validateUrl('javascript:alert(1)');
    expect(result).toBe('URL must use http or https protocol');
  });

  it('returns error for file: protocol', () => {
    const result = validateUrl('file:///etc/passwd');
    expect(result).toBe('URL must use http or https protocol');
  });

  it('returns error for data: protocol', () => {
    const result = validateUrl('data:text/html,<script>alert(1)</script>');
    expect(result).toBe('URL must use http or https protocol');
  });

  it('returns error for ftp: protocol', () => {
    const result = validateUrl('ftp://ftp.example.com/file');
    expect(result).toBe('URL must use http or https protocol');
  });
});
