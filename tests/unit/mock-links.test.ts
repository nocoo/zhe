import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getMockLink, isLinkExpired, MOCK_LINKS } from '@/lib/mock-links';

describe('getMockLink', () => {
  it('returns link for existing slug', () => {
    const link = getMockLink('github');
    expect(link).not.toBeNull();
    expect(link?.originalUrl).toBe('https://github.com');
  });

  it('returns null for non-existing slug', () => {
    const link = getMockLink('nonexistent');
    expect(link).toBeNull();
  });

  it('is case-sensitive', () => {
    const link = getMockLink('GitHub');
    expect(link).toBeNull();
  });
});

describe('isLinkExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for link without expiration', () => {
    const link = { id: 100, slug: 'test', originalUrl: 'https://test.com' };
    expect(isLinkExpired(link)).toBe(false);
  });

  it('returns false for link with future expiration', () => {
    const link = {
      id: 101,
      slug: 'test',
      originalUrl: 'https://test.com',
      expiresAt: new Date('2030-01-01'),
    };
    expect(isLinkExpired(link)).toBe(false);
  });

  it('returns true for link with past expiration', () => {
    const link = {
      id: 102,
      slug: 'test',
      originalUrl: 'https://test.com',
      expiresAt: new Date('2020-01-01'),
    };
    expect(isLinkExpired(link)).toBe(true);
  });
});

describe('MOCK_LINKS', () => {
  it('contains expected test data', () => {
    expect(MOCK_LINKS.length).toBeGreaterThan(0);
    
    const github = MOCK_LINKS.find(l => l.slug === 'github');
    expect(github).toBeDefined();
    
    const expired = MOCK_LINKS.find(l => l.slug === 'expired');
    expect(expired?.expiresAt).toBeDefined();
  });
});
