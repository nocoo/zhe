import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLink,
  getLinksByUserId,
  deleteLinkById,
  updateLink,
} from '@/lib/db';
import { clearMockStorage } from '../mocks/db-storage';

describe('Link DB Operations', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  describe('getLinksByUserId', () => {
    it('should return all links for a user', async () => {
      await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/a',
        slug: 'aaa',
      });
      await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/b',
        slug: 'bbb',
      });

      const links = await getLinksByUserId('user-1');

      expect(links).toHaveLength(2);
      expect(links.every((l) => l.userId === 'user-1')).toBe(true);
      const slugs = links.map((l) => l.slug);
      expect(slugs).toContain('aaa');
      expect(slugs).toContain('bbb');
    });

    it('should not return links belonging to other users', async () => {
      await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/a',
        slug: 'aaa',
      });
      await createLink({
        userId: 'user-2',
        originalUrl: 'https://example.com/b',
        slug: 'bbb',
      });

      const links = await getLinksByUserId('user-1');

      expect(links).toHaveLength(1);
      expect(links[0].slug).toBe('aaa');
    });

    it('should return empty array when user has no links', async () => {
      const links = await getLinksByUserId('nonexistent-user');
      expect(links).toHaveLength(0);
    });

    it('should return links ordered by created_at descending', async () => {
      await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/first',
        slug: 'first',
      });
      await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/second',
        slug: 'second',
      });

      const links = await getLinksByUserId('user-1');

      expect(links).toHaveLength(2);
      // Most recent first
      expect(links[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        links[1].createdAt.getTime()
      );
    });

    it('should map rows through rowToLink correctly', async () => {
      const expiresAt = new Date('2027-01-01T00:00:00Z');
      await createLink({
        userId: 'user-1',
        folderId: 'folder-42',
        originalUrl: 'https://example.com/mapped',
        slug: 'mapped',
        isCustom: true,
        expiresAt,
        clicks: 5,
      });

      const links = await getLinksByUserId('user-1');

      expect(links).toHaveLength(1);
      const link = links[0];
      expect(link.id).toBeTypeOf('number');
      expect(link.userId).toBe('user-1');
      expect(link.folderId).toBe('folder-42');
      expect(link.originalUrl).toBe('https://example.com/mapped');
      expect(link.slug).toBe('mapped');
      expect(link.isCustom).toBe(true);
      expect(link.expiresAt).toBeInstanceOf(Date);
      expect(link.expiresAt!.getTime()).toBe(expiresAt.getTime());
      expect(link.clicks).toBe(5);
      expect(link.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('deleteLinkById', () => {
    it('should delete an existing link and return true', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/delete-me',
        slug: 'del',
      });

      const result = await deleteLinkById(link.id, 'user-1');

      expect(result).toBe(true);

      // Verify the link is actually gone
      const remaining = await getLinksByUserId('user-1');
      expect(remaining).toHaveLength(0);
    });

    it('should return false when link id does not exist', async () => {
      const result = await deleteLinkById(9999, 'user-1');
      expect(result).toBe(false);
    });

    it('should return false when userId does not match', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/protected',
        slug: 'prot',
      });

      const result = await deleteLinkById(link.id, 'user-2');

      expect(result).toBe(false);

      // Link should still exist
      const links = await getLinksByUserId('user-1');
      expect(links).toHaveLength(1);
    });

    it('should only delete the targeted link', async () => {
      const link1 = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/keep',
        slug: 'keep',
      });
      const link2 = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/remove',
        slug: 'remove',
      });

      await deleteLinkById(link2.id, 'user-1');

      const links = await getLinksByUserId('user-1');
      expect(links).toHaveLength(1);
      expect(links[0].id).toBe(link1.id);
    });
  });

  describe('updateLink', () => {
    it('should update originalUrl', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://old.com',
        slug: 'upd1',
      });

      const updated = await updateLink(link.id, 'user-1', {
        originalUrl: 'https://new.com',
      });

      expect(updated).not.toBeNull();
      expect(updated!.originalUrl).toBe('https://new.com');
      expect(updated!.slug).toBe('upd1');
    });

    it('should update folderId', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'upd2',
      });

      const updated = await updateLink(link.id, 'user-1', {
        folderId: 'folder-new',
      });

      expect(updated).not.toBeNull();
      expect(updated!.folderId).toBe('folder-new');
    });

    it('should update expiresAt', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'upd3',
      });

      const newExpiry = new Date('2028-06-15T00:00:00Z');
      const updated = await updateLink(link.id, 'user-1', {
        expiresAt: newExpiry,
      });

      expect(updated).not.toBeNull();
      expect(updated!.expiresAt).toBeInstanceOf(Date);
      expect(updated!.expiresAt!.getTime()).toBe(newExpiry.getTime());
    });

    it('should update multiple fields at once', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://old.com',
        slug: 'upd4',
        folderId: 'folder-old',
      });

      const newExpiry = new Date('2029-01-01T00:00:00Z');
      const updated = await updateLink(link.id, 'user-1', {
        originalUrl: 'https://brand-new.com',
        folderId: 'folder-new',
        expiresAt: newExpiry,
      });

      expect(updated).not.toBeNull();
      expect(updated!.originalUrl).toBe('https://brand-new.com');
      expect(updated!.folderId).toBe('folder-new');
      expect(updated!.expiresAt!.getTime()).toBe(newExpiry.getTime());
    });

    it('should return existing link when no fields are provided (empty data)', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'upd5',
      });

      const result = await updateLink(link.id, 'user-1', {});

      expect(result).not.toBeNull();
      expect(result!.id).toBe(link.id);
      expect(result!.originalUrl).toBe('https://example.com');
    });

    it('should return null when link does not exist', async () => {
      const result = await updateLink(9999, 'user-1', {
        originalUrl: 'https://nope.com',
      });

      expect(result).toBeNull();
    });

    it('should return null when userId does not match', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'upd6',
      });

      const result = await updateLink(link.id, 'user-2', {
        originalUrl: 'https://hacked.com',
      });

      expect(result).toBeNull();

      // Verify original is unchanged
      const links = await getLinksByUserId('user-1');
      expect(links[0].originalUrl).toBe('https://example.com');
    });

    it('should return null for empty data when link does not exist', async () => {
      const result = await updateLink(9999, 'user-1', {});
      expect(result).toBeNull();
    });

    it('should allow clearing expiresAt to null', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'upd7',
        expiresAt: new Date('2028-01-01T00:00:00Z'),
      });

      const updated = await updateLink(link.id, 'user-1', {
        expiresAt: null,
      });

      expect(updated).not.toBeNull();
      expect(updated!.expiresAt).toBeNull();
    });
  });
});
