import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLink,
  getLinkByUserAndUrl,
  getFolderByUserAndName,
  getWebhookByToken,
} from '@/lib/db';
import { verifyApiKeyAndGetUser } from '@/lib/db/api-keys';
import { ScopedDB } from '@/lib/db/scoped';
import { hashApiKey } from '@/models/api-key';
import { clearMockStorage, getMockFolders, getMockWebhooks } from '../mocks/db-storage';
import { unwrap } from '../test-utils';

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
      expect(unwrap(found).userId).toBe('user-1');
      expect(unwrap(found).originalUrl).toBe('https://example.com/existing');
      expect(unwrap(found).slug).toBe('exist1');
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
      expect(unwrap(found).slug).toBe('second');
      expect(unwrap(found).originalUrl).toBe('https://example.com/second');
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
      expect(unwrap(found).id).toBeTypeOf('number');
      expect(unwrap(found).userId).toBe('user-1');
      expect(unwrap(found).folderId).toBe('folder-99');
      expect(unwrap(found).isCustom).toBe(true);
      expect(unwrap(found).expiresAt).toBeInstanceOf(Date);
      expect(unwrap(unwrap(found).expiresAt).getTime()).toBe(expiresAt.getTime());
      expect(unwrap(found).clicks).toBe(10);
      expect(unwrap(found).createdAt).toBeInstanceOf(Date);
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
      expect(unwrap(folder).id).toBe('f1');
      expect(unwrap(folder).name).toBe('工作');
    });

    it('should match folder name case-insensitively', async () => {
      seedFolder('f2', 'user-1', 'Projects');

      const folder = await getFolderByUserAndName('user-1', 'projects');

      expect(folder).not.toBeNull();
      expect(unwrap(folder).id).toBe('f2');
      expect(unwrap(folder).name).toBe('Projects');
    });

    it('should match folder name case-insensitively (uppercase query)', async () => {
      seedFolder('f3', 'user-1', 'work');

      const folder = await getFolderByUserAndName('user-1', 'WORK');

      expect(folder).not.toBeNull();
      expect(unwrap(folder).id).toBe('f3');
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
      expect(unwrap(webhook).token).toBe('tok_abc123');
      expect(unwrap(webhook).userId).toBe('user-1');
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
      expect(unwrap(webhook).id).toBeTypeOf('number');
      expect(unwrap(webhook).userId).toBe('user-1');
      expect(unwrap(webhook).token).toBe('tok_mapped');
      expect(unwrap(webhook).rateLimit).toBe(10);
      expect(unwrap(webhook).createdAt).toBeInstanceOf(Date);
    });

    it('should return the correct webhook when multiple exist', async () => {
      seedWebhook('user-1', 'tok_first');
      seedWebhook('user-2', 'tok_second');

      const first = await getWebhookByToken('tok_first');
      const second = await getWebhookByToken('tok_second');

      expect(first).not.toBeNull();
      expect(unwrap(first).userId).toBe('user-1');

      expect(second).not.toBeNull();
      expect(unwrap(second).userId).toBe('user-2');
    });

    it('should default rateLimit to 5 when not explicitly set', async () => {
      seedWebhook('user-1', 'tok_default');

      const webhook = await getWebhookByToken('tok_default');

      expect(webhook).not.toBeNull();
      expect(unwrap(webhook).rateLimit).toBe(5);
    });
  });
});

describe('API Key Authentication', () => {
  const TEST_USER = 'user-apikey-test';

  beforeEach(() => {
    clearMockStorage();
  });

  it('verifyApiKeyAndGetUser returns null for non-existent key', async () => {
    const result = await verifyApiKeyAndGetUser('zhe_nonexistent_key_12345');
    expect(result).toBeNull();
  });

  it('verifyApiKeyAndGetUser returns null for revoked key', async () => {
    const db = new ScopedDB(TEST_USER);
    const fullKey = 'zhe_revokedkey_12345678';
    const keyHash = hashApiKey(fullKey);

    await db.createApiKey({
      id: 'key-revoked',
      prefix: 'zhe_revoked',
      keyHash,
      name: 'Revoked Key',
      scopes: 'links:read',
    });

    // Revoke the key
    await db.revokeApiKey('key-revoked');

    const result = await verifyApiKeyAndGetUser(fullKey);
    expect(result).toBeNull();
  });

  it('verifyApiKeyAndGetUser returns user info for valid key', async () => {
    const db = new ScopedDB(TEST_USER);
    const fullKey = 'zhe_validkey_123456789';
    const keyHash = hashApiKey(fullKey);

    await db.createApiKey({
      id: 'key-valid',
      prefix: 'zhe_validk',
      keyHash,
      name: 'Valid Key',
      scopes: 'links:read,links:write',
    });

    const result = await verifyApiKeyAndGetUser(fullKey);

    expect(result).not.toBeNull();
    expect(result?.userId).toBe(TEST_USER);
    expect(result?.keyId).toBe('key-valid');
    expect(result?.scopes).toContain('links:read');
    expect(result?.scopes).toContain('links:write');
  });

  it('verifyApiKeyAndGetUser returns null for wrong key (hash mismatch)', async () => {
    const db = new ScopedDB(TEST_USER);
    const correctKey = 'zhe_correctkey_12345678';
    const wrongKey = 'zhe_wrongkey_123456789';
    const keyHash = hashApiKey(correctKey);

    await db.createApiKey({
      id: 'key-hashtest',
      prefix: 'zhe_correct',
      keyHash,
      name: 'Hash Test Key',
      scopes: 'links:read',
    });

    // Try with wrong key (different hash)
    const result = await verifyApiKeyAndGetUser(wrongKey);
    expect(result).toBeNull();
  });
});
