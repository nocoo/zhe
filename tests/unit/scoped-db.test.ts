import { describe, it, expect, beforeEach } from 'vitest';
import { ScopedDB } from '@/lib/db/scoped';
import { recordClick, createLink } from '@/lib/db';
import { clearMockStorage } from '../mocks/db-storage';

const USER_A = 'user-alice';
const USER_B = 'user-bob';

describe('ScopedDB', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  // ---- Construction ------------------------------------------

  it('throws on empty userId', () => {
    expect(() => new ScopedDB('')).toThrow('ScopedDB requires a non-empty userId');
  });

  // ---- Link CRUD scoped to owner -----------------------------

  describe('link operations', () => {
    it('createLink assigns the scoped userId', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({
        originalUrl: 'https://example.com',
        slug: 'abc',
      });

      expect(link.userId).toBe(USER_A);
      expect(link.slug).toBe('abc');
    });

    it('getLinks only returns own links', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createLink({ originalUrl: 'https://a.com', slug: 'a1' });
      await dbA.createLink({ originalUrl: 'https://a2.com', slug: 'a2' });
      await dbB.createLink({ originalUrl: 'https://b.com', slug: 'b1' });

      const linksA = await dbA.getLinks();
      const linksB = await dbB.getLinks();

      expect(linksA).toHaveLength(2);
      expect(linksB).toHaveLength(1);
      expect(linksA.every(l => l.userId === USER_A)).toBe(true);
      expect(linksB.every(l => l.userId === USER_B)).toBe(true);
    });

    it('getLinkById returns null for other user link', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const link = await dbA.createLink({ originalUrl: 'https://a.com', slug: 'priv' });

      expect(await dbA.getLinkById(link.id)).not.toBeNull();
      expect(await dbB.getLinkById(link.id)).toBeNull();
    });

    it('deleteLink cannot delete another user link', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const link = await dbA.createLink({ originalUrl: 'https://a.com', slug: 'del' });

      // Bob cannot delete Alice's link
      expect(await dbB.deleteLink(link.id)).toBe(false);
      // Alice can
      expect(await dbA.deleteLink(link.id)).toBe(true);
    });

    it('updateLink cannot update another user link', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const link = await dbA.createLink({ originalUrl: 'https://old.com', slug: 'upd' });

      // Bob cannot update Alice's link
      const bobResult = await dbB.updateLink(link.id, { originalUrl: 'https://hacked.com' });
      expect(bobResult).toBeNull();

      // Alice can
      const aliceResult = await dbA.updateLink(link.id, { originalUrl: 'https://new.com' });
      expect(aliceResult?.originalUrl).toBe('https://new.com');
    });

    it('updateLink with empty data returns existing link unchanged', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://keep.com', slug: 'noop' });

      // Pass empty object — should hit the early return (lines 140-142)
      const result = await db.updateLink(link.id, {});
      expect(result).not.toBeNull();
      expect(result!.id).toBe(link.id);
      expect(result!.originalUrl).toBe('https://keep.com');
    });

    it('updateLink with empty data returns null for non-existent link', async () => {
      const db = new ScopedDB(USER_A);

      // Non-existent id, empty data — exercises the early-return path with a miss
      const result = await db.updateLink(99999, {});
      expect(result).toBeNull();
    });
  });

  // ---- Analytics scoped through link ownership ---------------

  describe('analytics operations', () => {
    it('getAnalyticsByLinkId returns data only for owned links', async () => {
      // Create links for both users via the unscoped db (simulating existing data)
      const linkA = await createLink({
        userId: USER_A,
        originalUrl: 'https://a.com',
        slug: 'analytics-a',
      });
      const linkB = await createLink({
        userId: USER_B,
        originalUrl: 'https://b.com',
        slug: 'analytics-b',
      });

      // Record clicks (system-level, no user scope)
      await recordClick({ linkId: linkA.id, country: 'US' });
      await recordClick({ linkId: linkA.id, country: 'UK' });
      await recordClick({ linkId: linkB.id, country: 'JP' });

      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      // Alice sees only her link's analytics
      const analyticsA = await dbA.getAnalyticsByLinkId(linkA.id);
      expect(analyticsA).toHaveLength(2);

      // Alice cannot see Bob's link analytics
      const crossAccess = await dbA.getAnalyticsByLinkId(linkB.id);
      expect(crossAccess).toHaveLength(0);

      // Bob sees only his own
      const analyticsB = await dbB.getAnalyticsByLinkId(linkB.id);
      expect(analyticsB).toHaveLength(1);
    });

    it('getAnalyticsStats enforces ownership via JOIN', async () => {
      const linkA = await createLink({
        userId: USER_A,
        originalUrl: 'https://a.com',
        slug: 'stats-a',
      });

      await recordClick({ linkId: linkA.id, device: 'desktop', browser: 'Chrome', os: 'macOS', country: 'US' });
      await recordClick({ linkId: linkA.id, device: 'mobile', browser: 'Safari', os: 'iOS', country: 'US' });

      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const statsA = await dbA.getAnalyticsStats(linkA.id);
      expect(statsA.totalClicks).toBe(2);
      expect(statsA.deviceBreakdown.desktop).toBe(1);
      expect(statsA.deviceBreakdown.mobile).toBe(1);

      // Bob gets zero stats for Alice's link
      const statsB = await dbB.getAnalyticsStats(linkA.id);
      expect(statsB.totalClicks).toBe(0);
    });

    it('getAnalyticsStats aggregates browser and OS breakdowns', async () => {
      const link = await createLink({
        userId: USER_A,
        originalUrl: 'https://a.com',
        slug: 'stats-full',
      });

      await recordClick({ linkId: link.id, device: 'desktop', browser: 'Chrome', os: 'macOS', country: 'US' });
      await recordClick({ linkId: link.id, device: 'desktop', browser: 'Chrome', os: 'Windows', country: 'DE' });
      await recordClick({ linkId: link.id, device: 'mobile', browser: 'Safari', os: 'iOS', country: 'US' });

      const db = new ScopedDB(USER_A);
      const stats = await db.getAnalyticsStats(link.id);

      expect(stats.totalClicks).toBe(3);
      expect(stats.uniqueCountries).toContain('US');
      expect(stats.uniqueCountries).toContain('DE');
      expect(stats.browserBreakdown.Chrome).toBe(2);
      expect(stats.browserBreakdown.Safari).toBe(1);
      expect(stats.osBreakdown.macOS).toBe(1);
      expect(stats.osBreakdown.Windows).toBe(1);
      expect(stats.osBreakdown.iOS).toBe(1);
    });

    it('getAnalyticsStats returns empty breakdowns when no clicks exist', async () => {
      const link = await createLink({
        userId: USER_A,
        originalUrl: 'https://empty.com',
        slug: 'stats-empty',
      });

      const db = new ScopedDB(USER_A);
      const stats = await db.getAnalyticsStats(link.id);

      expect(stats.totalClicks).toBe(0);
      expect(stats.uniqueCountries).toEqual([]);
      expect(stats.deviceBreakdown).toEqual({});
      expect(stats.browserBreakdown).toEqual({});
      expect(stats.osBreakdown).toEqual({});
    });
  });

  // ---- Folders -----------------------------------------------

  describe('folder operations', () => {
    it('getFolders returns an empty array when no folders exist', async () => {
      const db = new ScopedDB(USER_A);
      const folders = await db.getFolders();

      expect(folders).toEqual([]);
    });

    it('createFolder assigns the scoped userId and defaults', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'Work', icon: 'briefcase' });

      expect(folder.userId).toBe(USER_A);
      expect(folder.name).toBe('Work');
      expect(folder.icon).toBe('briefcase');
      expect(folder.id).toBeTruthy();
      expect(folder.createdAt).toBeInstanceOf(Date);
    });

    it('createFolder uses default icon when not specified', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'Default' });

      expect(folder.icon).toBe('folder');
    });

    it('getFolders only returns own folders', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createFolder({ name: 'Alice Folder 1' });
      await dbA.createFolder({ name: 'Alice Folder 2' });
      await dbB.createFolder({ name: 'Bob Folder' });

      const foldersA = await dbA.getFolders();
      const foldersB = await dbB.getFolders();

      expect(foldersA).toHaveLength(2);
      expect(foldersB).toHaveLength(1);
      expect(foldersA.every(f => f.userId === USER_A)).toBe(true);
      expect(foldersB.every(f => f.userId === USER_B)).toBe(true);
    });

    it('getFolderById returns folder for owner', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'Mine' });

      const found = await db.getFolderById(folder.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(folder.id);
      expect(found!.name).toBe('Mine');
    });

    it('getFolderById returns null for other user', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const folder = await dbA.createFolder({ name: 'Private' });

      expect(await dbB.getFolderById(folder.id)).toBeNull();
    });

    it('getFolderById returns null for non-existent folder', async () => {
      const db = new ScopedDB(USER_A);
      expect(await db.getFolderById('non-existent-id')).toBeNull();
    });

    it('updateFolder updates name and icon', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'Old Name', icon: 'folder' });

      const updated = await db.updateFolder(folder.id, { name: 'New Name', icon: 'star' });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
      expect(updated!.icon).toBe('star');
    });

    it('updateFolder updates only name when icon is not provided', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'Original', icon: 'heart' });

      const updated = await db.updateFolder(folder.id, { name: 'Renamed' });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Renamed');
      expect(updated!.icon).toBe('heart');
    });

    it('updateFolder updates only icon when name is not provided', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'Keep', icon: 'folder' });

      const updated = await db.updateFolder(folder.id, { icon: 'rocket' });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Keep');
      expect(updated!.icon).toBe('rocket');
    });

    it('updateFolder with empty data returns existing folder', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'NoChange' });

      const result = await db.updateFolder(folder.id, {});
      expect(result).not.toBeNull();
      expect(result!.name).toBe('NoChange');
    });

    it('updateFolder returns null for other user folder', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const folder = await dbA.createFolder({ name: 'Protected' });

      expect(await dbB.updateFolder(folder.id, { name: 'Hacked' })).toBeNull();
    });

    it('deleteFolder removes the folder', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'ToDelete' });

      expect(await db.deleteFolder(folder.id)).toBe(true);

      const folders = await db.getFolders();
      expect(folders).toHaveLength(0);
    });

    it('deleteFolder cannot delete other user folder', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const folder = await dbA.createFolder({ name: 'Protected' });

      expect(await dbB.deleteFolder(folder.id)).toBe(false);
      // Folder still exists for Alice
      const folders = await dbA.getFolders();
      expect(folders).toHaveLength(1);
    });

    it('deleteFolder sets folder_id to null on associated links', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'Temp' });

      const link = await db.createLink({
        originalUrl: 'https://example.com',
        slug: 'folder-link',
        folderId: folder.id,
      });

      expect(link.folderId).toBe(folder.id);

      await db.deleteFolder(folder.id);

      const links = await db.getLinks();
      expect(links[0].folderId).toBeNull();
    });
  });

  // ---- Uploads -----------------------------------------------

  describe('upload operations', () => {
    it('createUpload assigns the scoped userId', async () => {
      const db = new ScopedDB(USER_A);
      const upload = await db.createUpload({
        key: '20260212/test-uuid.png',
        fileName: 'photo.png',
        fileType: 'image/png',
        fileSize: 1024,
        publicUrl: 'https://s.zhe.to/20260212/test-uuid.png',
      });

      expect(upload.userId).toBe(USER_A);
      expect(upload.key).toBe('20260212/test-uuid.png');
      expect(upload.fileName).toBe('photo.png');
      expect(upload.fileType).toBe('image/png');
      expect(upload.fileSize).toBe(1024);
      expect(upload.publicUrl).toBe('https://s.zhe.to/20260212/test-uuid.png');
      expect(upload.id).toBeGreaterThan(0);
      expect(upload.createdAt).toBeInstanceOf(Date);
    });

    it('getUploads only returns own uploads', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createUpload({
        key: '20260212/a1.png',
        fileName: 'a1.png',
        fileType: 'image/png',
        fileSize: 100,
        publicUrl: 'https://s.zhe.to/20260212/a1.png',
      });
      await dbA.createUpload({
        key: '20260212/a2.jpg',
        fileName: 'a2.jpg',
        fileType: 'image/jpeg',
        fileSize: 200,
        publicUrl: 'https://s.zhe.to/20260212/a2.jpg',
      });
      await dbB.createUpload({
        key: '20260212/b1.pdf',
        fileName: 'b1.pdf',
        fileType: 'application/pdf',
        fileSize: 300,
        publicUrl: 'https://s.zhe.to/20260212/b1.pdf',
      });

      const uploadsA = await dbA.getUploads();
      const uploadsB = await dbB.getUploads();

      expect(uploadsA).toHaveLength(2);
      expect(uploadsB).toHaveLength(1);
      expect(uploadsA.every(u => u.userId === USER_A)).toBe(true);
      expect(uploadsB.every(u => u.userId === USER_B)).toBe(true);
    });

    it('deleteUpload cannot delete another user upload', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const upload = await dbA.createUpload({
        key: '20260212/priv.png',
        fileName: 'priv.png',
        fileType: 'image/png',
        fileSize: 100,
        publicUrl: 'https://s.zhe.to/20260212/priv.png',
      });

      // Bob cannot delete Alice's upload
      expect(await dbB.deleteUpload(upload.id)).toBe(false);
      // Alice can
      expect(await dbA.deleteUpload(upload.id)).toBe(true);
    });

    it('getUploadKey returns key for own upload', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const upload = await dbA.createUpload({
        key: '20260212/getkey.png',
        fileName: 'getkey.png',
        fileType: 'image/png',
        fileSize: 100,
        publicUrl: 'https://s.zhe.to/20260212/getkey.png',
      });

      expect(await dbA.getUploadKey(upload.id)).toBe('20260212/getkey.png');
      expect(await dbB.getUploadKey(upload.id)).toBeNull();
    });

    it('getUploadKey returns null for non-existent upload', async () => {
      const db = new ScopedDB(USER_A);
      expect(await db.getUploadKey(99999)).toBeNull();
    });

    it('getUploads returns empty array when no uploads exist', async () => {
      const db = new ScopedDB(USER_A);
      const uploads = await db.getUploads();
      expect(uploads).toEqual([]);
    });
  });
});
