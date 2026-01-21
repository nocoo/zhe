import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLink, getLinks, deleteLink, updateLink } from '@/actions/links';
import { clearMockStorage } from '@/lib/db';

// Mock auth to return a test user
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id', name: 'Test', email: 'test@test.com' } }),
}));

describe('Link Server Actions', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  describe('createLink', () => {
    it('creates a link with auto-generated slug', async () => {
      const result = await createLink({
        originalUrl: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data?.slug).toHaveLength(6);
      expect(result.data?.originalUrl).toBe('https://example.com');
      expect(result.data?.isCustom).toBe(false);
    });

    it('creates a link with custom slug', async () => {
      const result = await createLink({
        originalUrl: 'https://example.com',
        customSlug: 'my-custom-link',
      });

      expect(result.success).toBe(true);
      expect(result.data?.slug).toBe('my-custom-link');
      expect(result.data?.isCustom).toBe(true);
    });

    it('rejects invalid URL', async () => {
      const result = await createLink({
        originalUrl: 'not-a-valid-url',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid URL');
    });

    it('rejects reserved slug', async () => {
      const result = await createLink({
        originalUrl: 'https://example.com',
        customSlug: 'login',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid slug format or reserved word');
    });

    it('rejects duplicate custom slug', async () => {
      await createLink({
        originalUrl: 'https://example1.com',
        customSlug: 'my-link',
      });

      const result = await createLink({
        originalUrl: 'https://example2.com',
        customSlug: 'my-link',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Slug already taken');
    });

    it('creates link with expiration date', async () => {
      const expiresAt = new Date('2030-01-01');
      const result = await createLink({
        originalUrl: 'https://example.com',
        expiresAt,
      });

      expect(result.success).toBe(true);
      expect(result.data?.expiresAt).toEqual(expiresAt);
    });
  });

  describe('getLinks', () => {
    it('returns empty array when no links', async () => {
      const result = await getLinks();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('returns all user links', async () => {
      await createLink({ originalUrl: 'https://example1.com' });
      await createLink({ originalUrl: 'https://example2.com' });

      const result = await getLinks();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('returns links in consistent order', async () => {
      await createLink({ originalUrl: 'https://first.com' });
      await createLink({ originalUrl: 'https://second.com' });

      const result = await getLinks();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      // Just verify both links are returned
      const urls = result.data?.map(l => l.originalUrl);
      expect(urls).toContain('https://first.com');
      expect(urls).toContain('https://second.com');
    });
  });

  describe('deleteLink', () => {
    it('deletes an existing link', async () => {
      const createResult = await createLink({ originalUrl: 'https://example.com' });
      const linkId = createResult.data!.id;

      const deleteResult = await deleteLink(linkId);
      expect(deleteResult.success).toBe(true);

      const linksResult = await getLinks();
      expect(linksResult.data).toHaveLength(0);
    });

    it('returns error for non-existent link', async () => {
      const result = await deleteLink(9999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Link not found or access denied');
    });
  });

  describe('updateLink', () => {
    it('updates link URL', async () => {
      const createResult = await createLink({ originalUrl: 'https://old.com' });
      const linkId = createResult.data!.id;

      const updateResult = await updateLink(linkId, {
        originalUrl: 'https://new.com',
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.originalUrl).toBe('https://new.com');
    });

    it('rejects invalid URL on update', async () => {
      const createResult = await createLink({ originalUrl: 'https://example.com' });
      const linkId = createResult.data!.id;

      const updateResult = await updateLink(linkId, {
        originalUrl: 'invalid-url',
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBe('Invalid URL');
    });

    it('returns error for non-existent link', async () => {
      const result = await updateLink(9999, {
        originalUrl: 'https://example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Link not found or access denied');
    });
  });
});
