import { describe, it, expect } from 'vitest';
import { isReservedPath, isValidSlug, RESERVED_PATHS } from '@/lib/constants';

describe('isReservedPath', () => {
  it('returns true for reserved paths', () => {
    expect(isReservedPath('login')).toBe(true);
    expect(isReservedPath('dashboard')).toBe(true);
    expect(isReservedPath('api')).toBe(true);
    expect(isReservedPath('_next')).toBe(true);
  });

  it('returns true for reserved paths with leading slash', () => {
    expect(isReservedPath('/login')).toBe(true);
    expect(isReservedPath('/dashboard')).toBe(true);
  });

  it('returns true for nested reserved paths', () => {
    expect(isReservedPath('api/something')).toBe(true);
    expect(isReservedPath('dashboard/links')).toBe(true);
  });

  it('returns true for case-insensitive reserved paths', () => {
    expect(isReservedPath('LOGIN')).toBe(true);
    expect(isReservedPath('Dashboard')).toBe(true);
  });

  it('returns false for non-reserved paths', () => {
    expect(isReservedPath('abc123')).toBe(false);
    expect(isReservedPath('my-link')).toBe(false);
    expect(isReservedPath('test_slug')).toBe(false);
  });
});

describe('isValidSlug', () => {
  it('returns true for valid slugs', () => {
    expect(isValidSlug('abc123')).toBe(true);
    expect(isValidSlug('my-link')).toBe(true);
    expect(isValidSlug('test_slug')).toBe(true);
    expect(isValidSlug('A1b2C3')).toBe(true);
  });

  it('returns false for empty slug', () => {
    expect(isValidSlug('')).toBe(false);
  });

  it('returns false for too long slugs', () => {
    expect(isValidSlug('a'.repeat(51))).toBe(false);
  });

  it('returns true for max length slug', () => {
    expect(isValidSlug('a'.repeat(50))).toBe(true);
  });

  it('returns false for slugs with invalid characters', () => {
    expect(isValidSlug('hello world')).toBe(false);
    expect(isValidSlug('hello@world')).toBe(false);
    expect(isValidSlug('hello/world')).toBe(false);
    expect(isValidSlug('hello.world')).toBe(false);
  });

  it('returns false for reserved paths', () => {
    expect(isValidSlug('login')).toBe(false);
    expect(isValidSlug('dashboard')).toBe(false);
    expect(isValidSlug('api')).toBe(false);
  });
});

describe('RESERVED_PATHS', () => {
  it('contains expected paths', () => {
    expect(RESERVED_PATHS).toContain('login');
    expect(RESERVED_PATHS).toContain('dashboard');
    expect(RESERVED_PATHS).toContain('api');
    expect(RESERVED_PATHS).toContain('_next');
    expect(RESERVED_PATHS).toContain('favicon.ico');
  });
});
