import { describe, it, expect, vi } from 'vitest';
import { generateSlug, generateUniqueSlug, sanitizeSlug } from '@/lib/slug';

describe('generateSlug', () => {
  it('generates a 6-character slug by default', () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(6);
  });

  it('generates a slug with custom length', () => {
    const slug = generateSlug(8);
    expect(slug).toHaveLength(8);
  });

  it('generates URL-safe characters only', () => {
    const slug = generateSlug();
    // Should only contain alphanumeric (excluding confusing chars)
    expect(slug).toMatch(/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz]+$/);
  });

  it('generates different slugs on each call', () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      slugs.add(generateSlug());
    }
    // Should have at least 95 unique slugs out of 100
    expect(slugs.size).toBeGreaterThan(95);
  });
});

describe('generateUniqueSlug', () => {
  it('returns a slug when no collision', async () => {
    const checkExists = vi.fn().mockResolvedValue(false);
    const slug = await generateUniqueSlug(checkExists);
    
    expect(slug).toHaveLength(6);
    expect(checkExists).toHaveBeenCalledTimes(1);
  });

  it('retries on collision and succeeds', async () => {
    const checkExists = vi.fn()
      .mockResolvedValueOnce(true)  // First attempt: collision
      .mockResolvedValueOnce(true)  // Second attempt: collision
      .mockResolvedValueOnce(false); // Third attempt: success
    
    const slug = await generateUniqueSlug(checkExists);
    
    expect(slug).toHaveLength(6);
    expect(checkExists).toHaveBeenCalledTimes(3);
  });

  it('throws error after max retries', async () => {
    const checkExists = vi.fn().mockResolvedValue(true); // Always collision
    
    await expect(generateUniqueSlug(checkExists, 3)).rejects.toThrow(
      'Failed to generate unique slug after 3 attempts'
    );
    expect(checkExists).toHaveBeenCalledTimes(3);
  });

  it('respects custom maxRetries', async () => {
    const checkExists = vi.fn().mockResolvedValue(true);
    
    await expect(generateUniqueSlug(checkExists, 5)).rejects.toThrow(
      'Failed to generate unique slug after 5 attempts'
    );
    expect(checkExists).toHaveBeenCalledTimes(5);
  });
});

describe('sanitizeSlug', () => {
  it('returns lowercase trimmed slug for valid input', () => {
    expect(sanitizeSlug('  MySlug  ')).toBe('myslug');
    expect(sanitizeSlug('Test123')).toBe('test123');
  });

  it('returns null for reserved paths', () => {
    expect(sanitizeSlug('login')).toBeNull();
    expect(sanitizeSlug('dashboard')).toBeNull();
    expect(sanitizeSlug('api')).toBeNull();
  });

  it('returns null for invalid characters', () => {
    expect(sanitizeSlug('hello world')).toBeNull();
    expect(sanitizeSlug('hello@world')).toBeNull();
    expect(sanitizeSlug('hello/world')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeSlug('')).toBeNull();
    expect(sanitizeSlug('   ')).toBeNull();
  });

  it('returns null for too long slugs', () => {
    expect(sanitizeSlug('a'.repeat(51))).toBeNull();
  });

  it('allows valid slugs with hyphens and underscores', () => {
    expect(sanitizeSlug('my-slug')).toBe('my-slug');
    expect(sanitizeSlug('my_slug')).toBe('my_slug');
    expect(sanitizeSlug('my-slug_123')).toBe('my-slug_123');
  });
});
