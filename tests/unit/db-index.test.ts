import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLink,
  getLinkByUserAndUrl,
  getFolderByUserAndName,
  getWebhookByToken,
} from '@/lib/db';
import { clearMockStorage, getMockFolders, getMockWebhooks } from '../mocks/db-storage';

describe('Link DB Operations', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  describe('getLinkByUserAndUrl', () => {
    it('should return the link when user has a link with the given URL', async () => {
      await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/existing',
        slug: 'exist1',
      });

      const found = await getLinkByUserAndUrl('user-1', 'https://example.com/existing');

      expect(found).not.toBeNull();
      expect(found!.userId).toBe('user-1');
      expect(found!.originalUrl).toBe('https://example.com/existing');
      expect(found!.slug).toBe('exist1');
    });

    it('should return null when URL does not exist for the user', async () => {
      await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com/a',
        slug: 'aaa',
      });

      const found = await getLinkByUserAndUrl('user-1', 'https://example.com/nonexistent');

      expect(found).toBeNull();
    });

    it('should not return links belonging to other users', async () => {
      await createLink({
        userId: 'user-2',
        originalUrl: 'https://example.com/shared',
        slug: 'shared',
      });

      const found = await getLinkByUserAndUrl('user-1', 'https://example.com/shared');

      expect(found).toBeNull();
    });

    it('should return null when no links exist at all', async () => {
      const found = await getLinkByUserAndUrl('user-1', 'https://example.com/nothing');
      expect(found).toBeNull();
    });

    it('should return the correct link when user has multiple links', async () => {
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

      const found = await getLinkByUserAndUrl('user-1', 'https://example.com/second');

      expect(found).not.toBeNull();
      expect(found!.slug).toBe('second');
      expect(found!.originalUrl).toBe('https://example.com/second');
    });

    it('should map the returned row through rowToLink correctly', async () => {
      const expiresAt = new Date('2027-06-01T00:00:00Z');
      await createLink({
        userId: 'user-1',
        folderId: 'folder-99',
        originalUrl: 'https://example.com/mapped',
        slug: 'mapped',
        isCustom: true,
        expiresAt,
        clicks: 10,
      });

      const found = await getLinkByUserAndUrl('user-1', 'https://example.com/mapped');

      expect(found).not.toBeNull();
      expect(found!.id).toBeTypeOf('number');
      expect(found!.userId).toBe('user-1');
      expect(found!.folderId).toBe('folder-99');
      expect(found!.isCustom).toBe(true);
      expect(found!.expiresAt).toBeInstanceOf(Date);
      expect(found!.expiresAt!.getTime()).toBe(expiresAt.getTime());
      expect(found!.clicks).toBe(10);
      expect(found!.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getFolderByUserAndName', () => {
    function seedFolder(id: string, userId: string, name: string) {
      const mockFolders = getMockFolders();
      mockFolders.set(id, {
        id,
        user_id: userId,
        name,
        icon: 'folder',
        created_at: Date.now(),
      } as unknown as import('@/lib/db/schema').Folder);
    }

    it('should find folder by exact name match', async () => {
      seedFolder('f1', 'user-1', '工作');

      const folder = await getFolderByUserAndName('user-1', '工作');

      expect(folder).not.toBeNull();
      expect(folder!.id).toBe('f1');
      expect(folder!.name).toBe('工作');
    });

    it('should match folder name case-insensitively', async () => {
      seedFolder('f2', 'user-1', 'Projects');

      const folder = await getFolderByUserAndName('user-1', 'projects');

      expect(folder).not.toBeNull();
      expect(folder!.id).toBe('f2');
      expect(folder!.name).toBe('Projects');
    });

    it('should match folder name case-insensitively (uppercase query)', async () => {
      seedFolder('f3', 'user-1', 'work');

      const folder = await getFolderByUserAndName('user-1', 'WORK');

      expect(folder).not.toBeNull();
      expect(folder!.id).toBe('f3');
    });

    it('should return null when folder name does not exist', async () => {
      seedFolder('f4', 'user-1', '工作');

      const folder = await getFolderByUserAndName('user-1', '生活');

      expect(folder).toBeNull();
    });

    it('should not return folders belonging to other users', async () => {
      seedFolder('f5', 'user-2', '工作');

      const folder = await getFolderByUserAndName('user-1', '工作');

      expect(folder).toBeNull();
    });

    it('should return null when no folders exist', async () => {
      const folder = await getFolderByUserAndName('user-1', '工作');
      expect(folder).toBeNull();
    });
  });

  describe('getWebhookByToken', () => {
    function seedWebhook(userId: string, token: string, rateLimit = 5) {
      const mockWebhooks = getMockWebhooks();
      mockWebhooks.set(userId, {
        id: mockWebhooks.size + 1,
        user_id: userId,
        token,
        rate_limit: rateLimit,
        created_at: Date.now(),
      } as unknown as import('@/lib/db/schema').Webhook);
    }

    it('should find a webhook by its token', async () => {
      seedWebhook('user-1', 'tok_abc123');

      const webhook = await getWebhookByToken('tok_abc123');

      expect(webhook).not.toBeNull();
      expect(webhook!.token).toBe('tok_abc123');
      expect(webhook!.userId).toBe('user-1');
    });

    it('should return null when token does not exist', async () => {
      seedWebhook('user-1', 'tok_abc123');

      const webhook = await getWebhookByToken('tok_nonexistent');

      expect(webhook).toBeNull();
    });

    it('should return null when no webhooks exist', async () => {
      const webhook = await getWebhookByToken('tok_nothing');
      expect(webhook).toBeNull();
    });

    it('should map row through rowToWebhook correctly', async () => {
      seedWebhook('user-1', 'tok_mapped', 10);

      const webhook = await getWebhookByToken('tok_mapped');

      expect(webhook).not.toBeNull();
      expect(webhook!.id).toBeTypeOf('number');
      expect(webhook!.userId).toBe('user-1');
      expect(webhook!.token).toBe('tok_mapped');
      expect(webhook!.rateLimit).toBe(10);
      expect(webhook!.createdAt).toBeInstanceOf(Date);
    });

    it('should return the correct webhook when multiple exist', async () => {
      seedWebhook('user-1', 'tok_first');
      seedWebhook('user-2', 'tok_second');

      const first = await getWebhookByToken('tok_first');
      const second = await getWebhookByToken('tok_second');

      expect(first).not.toBeNull();
      expect(first!.userId).toBe('user-1');

      expect(second).not.toBeNull();
      expect(second!.userId).toBe('user-2');
    });

    it('should default rateLimit to 5 when not explicitly set', async () => {
      seedWebhook('user-1', 'tok_default');

      const webhook = await getWebhookByToken('tok_default');

      expect(webhook).not.toBeNull();
      expect(webhook!.rateLimit).toBe(5);
    });
  });
});
