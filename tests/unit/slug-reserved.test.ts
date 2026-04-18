import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock nanoid so generateSlug returns controlled values
let slugSequence: string[] = [];
vi.mock('nanoid', () => ({
  customAlphabet: () => () => slugSequence.shift() ?? 'fallbk',
}));

import { generateUniqueSlug } from '@/lib/slug';

describe('generateUniqueSlug — reserved slug handling', () => {
  beforeEach(() => {
    slugSequence = [];
  });

  it('skips reserved slugs and continues retrying', async () => {
    // "login" is a reserved path — isValidSlug returns false → continue (line 33)
    slugSequence = ['login', 'abc123'];
    const checkExists = vi.fn().mockResolvedValue(false);

    const slug = await generateUniqueSlug(checkExists, 5);

    expect(slug).toBe('abc123');
    // checkExists should only have been called for the second (valid) slug
    expect(checkExists).toHaveBeenCalledTimes(1);
    expect(checkExists).toHaveBeenCalledWith('abc123');
  });
});
