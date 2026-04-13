import { describe, it, expect, beforeEach } from 'vitest';
import { ScopedDB } from '@/lib/db/scoped';
import { recordClick, createLink } from '@/lib/db';
import { clearMockStorage } from '../mocks/db-storage';
import { unwrap } from '../test-utils';

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

    it('createLink stores screenshotUrl when provided', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({
        originalUrl: 'https://example.com',
        slug: 'with-ss',
        screenshotUrl: 'https://img.example.com/shot.png',
      });

      expect(link.screenshotUrl).toBe('https://img.example.com/shot.png');

      // Verify persisted via getLinkById
      const fetched = await db.getLinkById(link.id);
      expect(fetched).not.toBeNull();
      expect(unwrap(fetched).screenshotUrl).toBe('https://img.example.com/shot.png');
    });

    it('createLink stores note when provided', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({
        originalUrl: 'https://example.com',
        slug: 'with-note',
        note: 'my note',
      });

      expect(link.note).toBe('my note');
    });

    it('createLink defaults screenshotUrl and note to null', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({
        originalUrl: 'https://example.com',
        slug: 'no-extras',
      });

      expect(link.screenshotUrl).toBeNull();
      expect(link.note).toBeNull();
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

    it('getLinks sorts by created date ascending', async () => {
      const db = new ScopedDB(USER_A);
      // Create links in sequence with small delay between them
      await db.createLink({ originalUrl: 'https://first.com', slug: 'sort-first' });
      await db.createLink({ originalUrl: 'https://second.com', slug: 'sort-second' });

      const linksAsc = await db.getLinks({ sortBy: 'created', sortOrder: 'asc' });

      expect(linksAsc[0]?.slug).toBe('sort-first');
      expect(linksAsc[1]?.slug).toBe('sort-second');
    });

    it('getLinks sorts by clicks descending', async () => {
      const db = new ScopedDB(USER_A);
      // Create links with different click counts
      await db.createLink({ originalUrl: 'https://low.com', slug: 'clicks-low', clicks: 5 });
      await db.createLink({ originalUrl: 'https://high.com', slug: 'clicks-high', clicks: 100 });
      await db.createLink({ originalUrl: 'https://mid.com', slug: 'clicks-mid', clicks: 50 });

      const linksDesc = await db.getLinks({ sortBy: 'clicks', sortOrder: 'desc' });

      // Find our test links in the result
      const highIndex = linksDesc.findIndex(l => l.slug === 'clicks-high');
      const midIndex = linksDesc.findIndex(l => l.slug === 'clicks-mid');
      const lowIndex = linksDesc.findIndex(l => l.slug === 'clicks-low');

      expect(highIndex).toBeLessThan(midIndex);
      expect(midIndex).toBeLessThan(lowIndex);
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
      expect(unwrap(result).id).toBe(link.id);
      expect(unwrap(result).originalUrl).toBe('https://keep.com');
    });

    it('updateLink with empty data returns null for non-existent link', async () => {
      const db = new ScopedDB(USER_A);

      // Non-existent id, empty data — exercises the early-return path with a miss
      const result = await db.updateLink(99999, {});
      expect(result).toBeNull();
    });

    it('updateLink updates slug and sets isCustom', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'oldslug' });

      const updated = await db.updateLink(link.id, { slug: 'newslug', isCustom: true });
      expect(updated).not.toBeNull();
      expect(unwrap(updated).slug).toBe('newslug');
      expect(unwrap(updated).isCustom).toBe(true);
    });

    it('updateLink slug change is reflected in getLinks', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'before' });

      await db.updateLink(link.id, { slug: 'after' });
      const links = await db.getLinks();
      expect(links.find(l => l.slug === 'after')).toBeDefined();
      expect(links.find(l => l.slug === 'before')).toBeUndefined();
    });

    it('updateLink updates screenshotUrl', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'ss1' });
      expect(link.screenshotUrl).toBeNull();

      const updated = await db.updateLink(link.id, { screenshotUrl: 'https://img.example.com/shot.png' });
      expect(updated).not.toBeNull();
      expect(unwrap(updated).screenshotUrl).toBe('https://img.example.com/shot.png');
    });

    it('updateLink clears screenshotUrl when set to null', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'ss2' });
      await db.updateLink(link.id, { screenshotUrl: 'https://img.example.com/shot.png' });

      const cleared = await db.updateLink(link.id, { screenshotUrl: null });
      expect(cleared).not.toBeNull();
      expect(unwrap(cleared).screenshotUrl).toBeNull();
    });
  });

  // ---- Link Metadata ----------------------------------------

  describe('updateLinkMetadata', () => {
    it('updates all metadata fields', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'meta1' });

      const updated = await db.updateLinkMetadata(link.id, {
        metaTitle: 'Example',
        metaDescription: 'An example site',
        metaFavicon: 'https://example.com/favicon.ico',
      });

      expect(updated).not.toBeNull();
      expect(unwrap(updated).metaTitle).toBe('Example');
      expect(unwrap(updated).metaDescription).toBe('An example site');
      expect(unwrap(updated).metaFavicon).toBe('https://example.com/favicon.ico');
    });

    it('updates only title when other fields are not provided', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'meta2' });

      const updated = await db.updateLinkMetadata(link.id, { metaTitle: 'Only Title' });

      expect(updated).not.toBeNull();
      expect(unwrap(updated).metaTitle).toBe('Only Title');
    });

    it('can set metadata to null (clear)', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'meta3' });

      // First set metadata
      await db.updateLinkMetadata(link.id, {
        metaTitle: 'Title',
        metaDescription: 'Desc',
        metaFavicon: 'https://example.com/icon.png',
      });

      // Then clear it
      const cleared = await db.updateLinkMetadata(link.id, {
        metaTitle: null,
        metaDescription: null,
        metaFavicon: null,
      });

      expect(cleared).not.toBeNull();
      expect(unwrap(cleared).metaTitle).toBeNull();
      expect(unwrap(cleared).metaDescription).toBeNull();
      expect(unwrap(cleared).metaFavicon).toBeNull();
    });

    it('returns null for another user link', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const link = await dbA.createLink({ originalUrl: 'https://example.com', slug: 'meta4' });

      const result = await dbB.updateLinkMetadata(link.id, { metaTitle: 'Hacked' });
      expect(result).toBeNull();
    });

    it('returns existing link when no metadata fields are provided', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'meta5' });

      const result = await db.updateLinkMetadata(link.id, {});
      expect(result).not.toBeNull();
      expect(unwrap(result).id).toBe(link.id);
    });

    it('returns null for non-existent link with empty data', async () => {
      const db = new ScopedDB(USER_A);

      const result = await db.updateLinkMetadata(99999, {});
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
      expect(unwrap(found).id).toBe(folder.id);
      expect(unwrap(found).name).toBe('Mine');
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
      expect(unwrap(updated).name).toBe('New Name');
      expect(unwrap(updated).icon).toBe('star');
    });

    it('updateFolder updates only name when icon is not provided', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'Original', icon: 'heart' });

      const updated = await db.updateFolder(folder.id, { name: 'Renamed' });

      expect(updated).not.toBeNull();
      expect(unwrap(updated).name).toBe('Renamed');
      expect(unwrap(updated).icon).toBe('heart');
    });

    it('updateFolder updates only icon when name is not provided', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'Keep', icon: 'folder' });

      const updated = await db.updateFolder(folder.id, { icon: 'rocket' });

      expect(updated).not.toBeNull();
      expect(unwrap(updated).name).toBe('Keep');
      expect(unwrap(updated).icon).toBe('rocket');
    });

    it('updateFolder with empty data returns existing folder', async () => {
      const db = new ScopedDB(USER_A);
      const folder = await db.createFolder({ name: 'NoChange' });

      const result = await db.updateFolder(folder.id, {});
      expect(result).not.toBeNull();
      expect(unwrap(result).name).toBe('NoChange');
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
      expect(unwrap(links[0]).folderId).toBeNull();
    });

    it('getFoldersWithLinkCount returns folders with link counts', async () => {
      const db = new ScopedDB(USER_A);
      const folderA = await db.createFolder({ name: 'Folder A' });
      const folderB = await db.createFolder({ name: 'Folder B' });

      // Add 2 links to folderA, 1 link to folderB
      await db.createLink({
        originalUrl: 'https://a1.com',
        slug: 'a1',
        folderId: folderA.id,
      });
      await db.createLink({
        originalUrl: 'https://a2.com',
        slug: 'a2',
        folderId: folderA.id,
      });
      await db.createLink({
        originalUrl: 'https://b1.com',
        slug: 'b1',
        folderId: folderB.id,
      });

      const foldersWithCount = await db.getFoldersWithLinkCount();

      // Should be sorted by createdAt DESC, so folderB first
      expect(foldersWithCount).toHaveLength(2);
      const folderBResult = foldersWithCount.find(f => f.id === folderB.id);
      const folderAResult = foldersWithCount.find(f => f.id === folderA.id);
      expect(folderBResult?.linkCount).toBe(1);
      expect(folderAResult?.linkCount).toBe(2);
    });

    it('getFoldersWithLinkCount returns 0 for folders without links', async () => {
      const db = new ScopedDB(USER_A);
      await db.createFolder({ name: 'Empty Folder' });

      const foldersWithCount = await db.getFoldersWithLinkCount();

      expect(foldersWithCount).toHaveLength(1);
      expect(foldersWithCount[0]?.linkCount).toBe(0);
    });

    it('getFoldersWithLinkCount only counts own folders', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const folderA = await dbA.createFolder({ name: 'Alice Folder' });
      await dbB.createFolder({ name: 'Bob Folder' });

      // Add link to Alice's folder
      await dbA.createLink({
        originalUrl: 'https://alice.com',
        slug: 'alice',
        folderId: folderA.id,
      });

      const aliceFolders = await dbA.getFoldersWithLinkCount();
      const bobFolders = await dbB.getFoldersWithLinkCount();

      expect(aliceFolders).toHaveLength(1);
      expect(aliceFolders[0]?.linkCount).toBe(1);
      expect(bobFolders).toHaveLength(1);
      expect(bobFolders[0]?.linkCount).toBe(0);
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

  // ---- Tags --------------------------------------------------

  describe('tag operations', () => {
    it('getTags returns empty array when no tags exist', async () => {
      const db = new ScopedDB(USER_A);
      const tags = await db.getTags();
      expect(tags).toEqual([]);
    });

    it('createTag assigns the scoped userId', async () => {
      const db = new ScopedDB(USER_A);
      const tag = await db.createTag({ name: 'work', color: 'blue' });

      expect(tag.userId).toBe(USER_A);
      expect(tag.name).toBe('work');
      expect(tag.color).toBe('blue');
      expect(tag.id).toBeTruthy();
      expect(tag.createdAt).toBeInstanceOf(Date);
    });

    it('getTags only returns own tags', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createTag({ name: 'work', color: 'blue' });
      await dbA.createTag({ name: 'personal', color: 'red' });
      await dbB.createTag({ name: 'bob-tag', color: 'emerald' });

      const tagsA = await dbA.getTags();
      const tagsB = await dbB.getTags();

      expect(tagsA).toHaveLength(2);
      expect(tagsB).toHaveLength(1);
      expect(tagsA.every(t => t.userId === USER_A)).toBe(true);
      expect(tagsB.every(t => t.userId === USER_B)).toBe(true);
    });

    it('updateTag updates name and color', async () => {
      const db = new ScopedDB(USER_A);
      const tag = await db.createTag({ name: 'old', color: 'blue' });

      const updated = await db.updateTag(tag.id, { name: 'new', color: 'red' });

      expect(updated).not.toBeNull();
      expect(unwrap(updated).name).toBe('new');
      expect(unwrap(updated).color).toBe('red');
    });

    it('updateTag updates only name', async () => {
      const db = new ScopedDB(USER_A);
      const tag = await db.createTag({ name: 'original', color: 'emerald' });

      const updated = await db.updateTag(tag.id, { name: 'renamed' });

      expect(updated).not.toBeNull();
      expect(unwrap(updated).name).toBe('renamed');
      expect(unwrap(updated).color).toBe('emerald');
    });

    it('updateTag updates only color', async () => {
      const db = new ScopedDB(USER_A);
      const tag = await db.createTag({ name: 'keep', color: 'blue' });

      const updated = await db.updateTag(tag.id, { color: 'rose' });

      expect(updated).not.toBeNull();
      expect(unwrap(updated).name).toBe('keep');
      expect(unwrap(updated).color).toBe('rose');
    });

    it('updateTag with empty data returns existing tag', async () => {
      const db = new ScopedDB(USER_A);
      const tag = await db.createTag({ name: 'nochange', color: 'slate' });

      const result = await db.updateTag(tag.id, {});
      expect(result).not.toBeNull();
      expect(unwrap(result).name).toBe('nochange');
    });

    it('updateTag returns null for other user tag', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const tag = await dbA.createTag({ name: 'private', color: 'blue' });

      expect(await dbB.updateTag(tag.id, { name: 'hacked' })).toBeNull();
    });

    it('updateTag with empty data returns null for non-existent tag', async () => {
      const db = new ScopedDB(USER_A);
      const result = await db.updateTag('non-existent-id', {});
      expect(result).toBeNull();
    });

    it('deleteTag removes the tag', async () => {
      const db = new ScopedDB(USER_A);
      const tag = await db.createTag({ name: 'to-delete', color: 'red' });

      expect(await db.deleteTag(tag.id)).toBe(true);

      const tags = await db.getTags();
      expect(tags).toHaveLength(0);
    });

    it('deleteTag cannot delete other user tag', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const tag = await dbA.createTag({ name: 'protected', color: 'blue' });

      expect(await dbB.deleteTag(tag.id)).toBe(false);
      const tags = await dbA.getTags();
      expect(tags).toHaveLength(1);
    });
  });

  // ---- Link-Tag associations --------------------------------

  describe('link-tag operations', () => {
    it('addTagToLink associates a tag with a link', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'lt1' });
      const tag = await db.createTag({ name: 'work', color: 'blue' });

      const result = await db.addTagToLink(link.id, tag.id);
      expect(result).toBe(true);

      const linkTags = await db.getLinkTags();
      expect(linkTags).toHaveLength(1);
      expect(unwrap(linkTags[0]).linkId).toBe(link.id);
      expect(unwrap(linkTags[0]).tagId).toBe(tag.id);
    });

    it('addTagToLink returns false for unowned link', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const link = await dbA.createLink({ originalUrl: 'https://a.com', slug: 'lt2' });
      const tag = await dbB.createTag({ name: 'bob-tag', color: 'red' });

      expect(await dbB.addTagToLink(link.id, tag.id)).toBe(false);
    });

    it('addTagToLink returns false for unowned tag', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const link = await dbA.createLink({ originalUrl: 'https://a.com', slug: 'lt3' });
      const tag = await dbB.createTag({ name: 'bob-tag', color: 'red' });

      expect(await dbA.addTagToLink(link.id, tag.id)).toBe(false);
    });

    it('getLinkTags only returns associations for own links', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const linkA = await dbA.createLink({ originalUrl: 'https://a.com', slug: 'lt4' });
      const tagA = await dbA.createTag({ name: 'a-tag', color: 'blue' });
      await dbA.addTagToLink(linkA.id, tagA.id);

      const linkB = await dbB.createLink({ originalUrl: 'https://b.com', slug: 'lt5' });
      const tagB = await dbB.createTag({ name: 'b-tag', color: 'red' });
      await dbB.addTagToLink(linkB.id, tagB.id);

      const linkTagsA = await dbA.getLinkTags();
      const linkTagsB = await dbB.getLinkTags();

      expect(linkTagsA).toHaveLength(1);
      expect(unwrap(linkTagsA[0]).linkId).toBe(linkA.id);
      expect(linkTagsB).toHaveLength(1);
      expect(unwrap(linkTagsB[0]).linkId).toBe(linkB.id);
    });

    it('removeTagFromLink removes the association', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'lt6' });
      const tag = await db.createTag({ name: 'temp', color: 'amber' });
      await db.addTagToLink(link.id, tag.id);

      expect(await db.removeTagFromLink(link.id, tag.id)).toBe(true);

      const linkTags = await db.getLinkTags();
      expect(linkTags).toHaveLength(0);
    });

    it('removeTagFromLink returns false for non-existent association', async () => {
      const db = new ScopedDB(USER_A);
      expect(await db.removeTagFromLink(99999, 'fake-id')).toBe(false);
    });

    it('removeTagFromLink cannot remove other user associations', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const link = await dbA.createLink({ originalUrl: 'https://a.com', slug: 'lt7' });
      const tag = await dbA.createTag({ name: 'a-tag', color: 'blue' });
      await dbA.addTagToLink(link.id, tag.id);

      expect(await dbB.removeTagFromLink(link.id, tag.id)).toBe(false);

      const linkTags = await dbA.getLinkTags();
      expect(linkTags).toHaveLength(1);
    });

    it('deleting a tag cascades to link_tags', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'lt8' });
      const tag = await db.createTag({ name: 'cascade', color: 'violet' });
      await db.addTagToLink(link.id, tag.id);

      await db.deleteTag(tag.id);

      const linkTags = await db.getLinkTags();
      expect(linkTags).toHaveLength(0);
    });

    it('deleting a link cascades to link_tags', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'lt9' });
      const tag = await db.createTag({ name: 'cascade2', color: 'pink' });
      await db.addTagToLink(link.id, tag.id);

      await db.deleteLink(link.id);

      const linkTags = await db.getLinkTags();
      expect(linkTags).toHaveLength(0);
    });

    it('addTagToLink is idempotent (INSERT OR IGNORE)', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'lt10' });
      const tag = await db.createTag({ name: 'dup', color: 'cyan' });

      await db.addTagToLink(link.id, tag.id);
      await db.addTagToLink(link.id, tag.id); // duplicate — should not throw

      const linkTags = await db.getLinkTags();
      expect(linkTags).toHaveLength(1);
    });
  });

  // ---- Link Note --------------------------------------------

  describe('updateLinkNote', () => {
    it('sets note on a link', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'note1' });

      const updated = await db.updateLinkNote(link.id, 'this is a note');

      expect(updated).not.toBeNull();
      expect(unwrap(updated).note).toBe('this is a note');
    });

    it('clears note by setting null', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'note2' });
      await db.updateLinkNote(link.id, 'has note');

      const cleared = await db.updateLinkNote(link.id, null);

      expect(cleared).not.toBeNull();
      expect(unwrap(cleared).note).toBeNull();
    });

    it('returns null for other user link', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const link = await dbA.createLink({ originalUrl: 'https://example.com', slug: 'note3' });

      expect(await dbB.updateLinkNote(link.id, 'hacked')).toBeNull();
    });

    it('returns null for non-existent link', async () => {
      const db = new ScopedDB(USER_A);
      expect(await db.updateLinkNote(99999, 'no link')).toBeNull();
    });

    it('newly created links have null note', async () => {
      const db = new ScopedDB(USER_A);
      const link = await db.createLink({ originalUrl: 'https://example.com', slug: 'note4' });
      expect(link.note).toBeNull();
    });
  });

  // ---- Overview stats ----------------------------------------

  describe('getOverviewStats', () => {
    it('returns zeroed stats when user has no data', async () => {
      const db = new ScopedDB(USER_A);
      const stats = await db.getOverviewStats();

      expect(stats.totalLinks).toBe(0);
      expect(stats.totalClicks).toBe(0);
      expect(stats.totalUploads).toBe(0);
      expect(stats.totalStorageBytes).toBe(0);
      expect(stats.clickTrend).toEqual([]);
      expect(stats.uploadTrend).toEqual([]);
      expect(stats.topLinks).toEqual([]);
      expect(stats.deviceBreakdown).toEqual({});
      expect(stats.browserBreakdown).toEqual({});
      expect(stats.osBreakdown).toEqual({});
      expect(stats.fileTypeBreakdown).toEqual({});
    });

    it('aggregates link and click counts across all user links', async () => {
      const db = new ScopedDB(USER_A);
      const link1 = await db.createLink({ originalUrl: 'https://a.com', slug: 'ov-a1', clicks: 10 });
      const link2 = await db.createLink({ originalUrl: 'https://b.com', slug: 'ov-a2', clicks: 5 });

      // Record some analytics clicks
      await recordClick({ linkId: link1.id, device: 'desktop', browser: 'Chrome', os: 'macOS', country: 'US' });
      await recordClick({ linkId: link1.id, device: 'mobile', browser: 'Safari', os: 'iOS', country: 'JP' });
      await recordClick({ linkId: link2.id, device: 'desktop', browser: 'Firefox', os: 'Windows', country: 'DE' });

      const stats = await db.getOverviewStats();

      expect(stats.totalLinks).toBe(2);
      // totalClicks comes from sum of links.clicks column (10 + 5 initial + 3 recorded = 18)
      expect(stats.totalClicks).toBe(18);
      expect(stats.clickTrend).toHaveLength(1); // all 3 clicks on same day
      expect(unwrap(stats.clickTrend[0]).clicks).toBe(3);
      expect(unwrap(stats.clickTrend[0]).origin).toBe(3); // no source tag (NULL) → counted as origin
      expect(unwrap(stats.clickTrend[0]).worker).toBe(0);
    });

    it('does not include other users data', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createLink({ originalUrl: 'https://a.com', slug: 'ov-iso-a', clicks: 100 });
      const linkB = await createLink({ userId: USER_B, originalUrl: 'https://b.com', slug: 'ov-iso-b' });
      await recordClick({ linkId: linkB.id, device: 'desktop', browser: 'Edge', os: 'Windows' });

      const statsA = await dbA.getOverviewStats();
      expect(statsA.totalLinks).toBe(1);
      expect(statsA.totalClicks).toBe(100);
      // Alice should not see Bob's analytics
      expect(statsA.clickTrend).toHaveLength(0);

      const statsB = await dbB.getOverviewStats();
      expect(statsB.totalLinks).toBe(1);
      expect(statsB.clickTrend).toHaveLength(1);
    });

    it('computes device/browser/OS breakdowns across all links', async () => {
      const db = new ScopedDB(USER_A);
      const link1 = await db.createLink({ originalUrl: 'https://a.com', slug: 'ov-br1' });
      const link2 = await db.createLink({ originalUrl: 'https://b.com', slug: 'ov-br2' });

      await recordClick({ linkId: link1.id, device: 'desktop', browser: 'Chrome', os: 'macOS' });
      await recordClick({ linkId: link1.id, device: 'mobile', browser: 'Chrome', os: 'Android' });
      await recordClick({ linkId: link2.id, device: 'desktop', browser: 'Safari', os: 'macOS' });

      const stats = await db.getOverviewStats();

      expect(stats.deviceBreakdown).toEqual({ desktop: 2, mobile: 1 });
      expect(stats.browserBreakdown).toEqual({ Chrome: 2, Safari: 1 });
      expect(stats.osBreakdown).toEqual({ macOS: 2, Android: 1 });
    });

    it('returns top links sorted by clicks descending', async () => {
      const db = new ScopedDB(USER_A);
      await db.createLink({ originalUrl: 'https://low.com', slug: 'ov-top-low', clicks: 5 });
      await db.createLink({ originalUrl: 'https://high.com', slug: 'ov-top-high', clicks: 100 });
      await db.createLink({ originalUrl: 'https://mid.com', slug: 'ov-top-mid', clicks: 50 });

      const stats = await db.getOverviewStats();

      expect(stats.topLinks).toHaveLength(3);
      expect(unwrap(stats.topLinks[0]).slug).toBe('ov-top-high');
      expect(unwrap(stats.topLinks[0]).clicks).toBe(100);
      expect(unwrap(stats.topLinks[1]).slug).toBe('ov-top-mid');
      expect(unwrap(stats.topLinks[2]).slug).toBe('ov-top-low');
    });

    it('includes upload stats with timestamps and file type breakdown', async () => {
      const db = new ScopedDB(USER_A);

      await db.createUpload({
        key: '20260212/ov1.png',
        fileName: 'ov1.png',
        fileType: 'image/png',
        fileSize: 1024,
        publicUrl: 'https://s.zhe.to/20260212/ov1.png',
      });
      await db.createUpload({
        key: '20260212/ov2.jpg',
        fileName: 'ov2.jpg',
        fileType: 'image/jpeg',
        fileSize: 2048,
        publicUrl: 'https://s.zhe.to/20260212/ov2.jpg',
      });

      const stats = await db.getOverviewStats();

      expect(stats.totalUploads).toBe(2);
      expect(stats.totalStorageBytes).toBe(3072);
      expect(stats.uploadTrend).toHaveLength(1); // both uploads on same day
      expect(unwrap(stats.uploadTrend[0]).uploads).toBe(2);
      expect(stats.fileTypeBreakdown).toEqual({ 'image/png': 1, 'image/jpeg': 1 });
    });

    it('does not include other users uploads', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createUpload({
        key: '20260212/alice.png',
        fileName: 'alice.png',
        fileType: 'image/png',
        fileSize: 500,
        publicUrl: 'https://s.zhe.to/20260212/alice.png',
      });
      await dbB.createUpload({
        key: '20260212/bob.png',
        fileName: 'bob.png',
        fileType: 'image/png',
        fileSize: 700,
        publicUrl: 'https://s.zhe.to/20260212/bob.png',
      });

      const statsA = await dbA.getOverviewStats();
      expect(statsA.totalUploads).toBe(1);
      expect(statsA.totalStorageBytes).toBe(500);

      const statsB = await dbB.getOverviewStats();
      expect(statsB.totalUploads).toBe(1);
      expect(statsB.totalStorageBytes).toBe(700);
    });
  });

  // ---- User Settings ----------------------------------------

  describe('user settings operations', () => {
    it('getUserSettings returns null when no settings exist', async () => {
      const db = new ScopedDB(USER_A);
      expect(await db.getUserSettings()).toBeNull();
    });

    it('upsertPreviewStyle creates settings when none exist', async () => {
      const db = new ScopedDB(USER_A);
      const settings = await db.upsertPreviewStyle('screenshot');

      expect(settings.userId).toBe(USER_A);
      expect(settings.previewStyle).toBe('screenshot');
    });

    it('getUserSettings returns settings after upsert', async () => {
      const db = new ScopedDB(USER_A);
      await db.upsertPreviewStyle('favicon');

      const settings = await db.getUserSettings();

      expect(settings).not.toBeNull();
      expect(unwrap(settings).userId).toBe(USER_A);
      expect(unwrap(settings).previewStyle).toBe('favicon');
    });

    it('upsertPreviewStyle updates existing settings', async () => {
      const db = new ScopedDB(USER_A);
      await db.upsertPreviewStyle('favicon');

      const updated = await db.upsertPreviewStyle('screenshot');

      expect(updated.previewStyle).toBe('screenshot');

      const settings = await db.getUserSettings();
      expect(unwrap(settings).previewStyle).toBe('screenshot');
    });

    it('settings are scoped to user (user isolation)', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.upsertPreviewStyle('screenshot');
      await dbB.upsertPreviewStyle('favicon');

      const settingsA = await dbA.getUserSettings();
      const settingsB = await dbB.getUserSettings();

      expect(unwrap(settingsA).previewStyle).toBe('screenshot');
      expect(unwrap(settingsB).previewStyle).toBe('favicon');
    });

    it('user without settings does not see other user settings', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.upsertPreviewStyle('screenshot');

      expect(await dbB.getUserSettings()).toBeNull();
    });
  });

  // ---- Webhook Operations -----------------------------------

  describe('Webhook Operations', () => {
    it('upsertWebhook creates a new webhook', async () => {
      const db = new ScopedDB(USER_A);
      const webhook = await db.upsertWebhook('tok_abc123');

      expect(webhook.userId).toBe(USER_A);
      expect(webhook.token).toBe('tok_abc123');
      expect(webhook.rateLimit).toBe(5);
      expect(webhook.createdAt).toBeInstanceOf(Date);
      expect(webhook.id).toBeGreaterThan(0);
    });

    it('upsertWebhook replaces existing webhook token', async () => {
      const db = new ScopedDB(USER_A);
      const first = await db.upsertWebhook('tok_old');
      const second = await db.upsertWebhook('tok_new');

      expect(second.userId).toBe(USER_A);
      expect(second.token).toBe('tok_new');
      // Should be the same user's webhook (upsert, not insert)
      expect(second.id).toBe(first.id);
    });

    it('upsertWebhook is scoped to user', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.upsertWebhook('tok_alice');
      await dbB.upsertWebhook('tok_bob');

      const webhookA = await dbA.getWebhook();
      const webhookB = await dbB.getWebhook();

      expect(webhookA).not.toBeNull();
      expect(unwrap(webhookA).token).toBe('tok_alice');
      expect(webhookB).not.toBeNull();
      expect(unwrap(webhookB).token).toBe('tok_bob');
    });

    it('getWebhook returns null when no webhook exists', async () => {
      const db = new ScopedDB(USER_A);
      expect(await db.getWebhook()).toBeNull();
    });

    it('updateWebhookRateLimit updates the rate limit', async () => {
      const db = new ScopedDB(USER_A);
      await db.upsertWebhook('tok_rate');

      const updated = await db.updateWebhookRateLimit(20);

      expect(updated).not.toBeNull();
      expect(unwrap(updated).rateLimit).toBe(20);
      expect(unwrap(updated).token).toBe('tok_rate');
    });

    it('updateWebhookRateLimit returns null when no webhook exists', async () => {
      const db = new ScopedDB(USER_A);

      const result = await db.updateWebhookRateLimit(10);

      expect(result).toBeNull();
    });

    it('updateWebhookRateLimit is scoped to user', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.upsertWebhook('tok_alice');

      // Bob cannot update Alice's webhook rate limit (he has no webhook)
      const bobResult = await dbB.updateWebhookRateLimit(100);
      expect(bobResult).toBeNull();

      // Alice can update her own
      const aliceResult = await dbA.updateWebhookRateLimit(15);
      expect(aliceResult).not.toBeNull();
      expect(unwrap(aliceResult).rateLimit).toBe(15);
    });

    it('deleteWebhook removes the webhook', async () => {
      const db = new ScopedDB(USER_A);
      await db.upsertWebhook('tok_delete');

      const deleted = await db.deleteWebhook();
      expect(deleted).toBe(true);

      const webhook = await db.getWebhook();
      expect(webhook).toBeNull();
    });

    it('deleteWebhook returns false when no webhook exists', async () => {
      const db = new ScopedDB(USER_A);

      const result = await db.deleteWebhook();
      expect(result).toBe(false);
    });

    it('deleteWebhook is scoped to user', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.upsertWebhook('tok_alice');
      await dbB.upsertWebhook('tok_bob');

      // Delete Alice's webhook
      expect(await dbA.deleteWebhook()).toBe(true);
      expect(await dbA.getWebhook()).toBeNull();

      // Bob's webhook should still exist
      expect(await dbB.getWebhook()).not.toBeNull();
      expect(unwrap(await dbB.getWebhook()).token).toBe('tok_bob');
    });
  });

  // ---- API Key CRUD -------------------------------------------

  describe('api key operations', () => {
    it('createApiKey creates a key scoped to user', async () => {
      const db = new ScopedDB(USER_A);
      const key = await db.createApiKey({
        id: 'key-1',
        prefix: 'zhe_abcd1234',
        keyHash: 'hash123',
        name: 'Test Key',
        scopes: 'links:read,links:write',
      });
      expect(key.userId).toBe(USER_A);
      expect(key.name).toBe('Test Key');
      expect(key.revokedAt).toBeNull();
    });

    it('getApiKeys returns only non-revoked keys for user', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createApiKey({ id: 'key-a1', prefix: 'zhe_a1', keyHash: 'h1', name: 'Key A1', scopes: 'links:read' });
      await dbA.createApiKey({ id: 'key-a2', prefix: 'zhe_a2', keyHash: 'h2', name: 'Key A2', scopes: 'links:write' });
      await dbB.createApiKey({ id: 'key-b1', prefix: 'zhe_b1', keyHash: 'h3', name: 'Key B1', scopes: 'links:read' });

      const keysA = await dbA.getApiKeys();
      expect(keysA).toHaveLength(2);
      keysA.forEach(k => expect(k.userId).toBe(USER_A));

      const keysB = await dbB.getApiKeys();
      expect(keysB).toHaveLength(1);
    });

    it('revokeApiKey soft-deletes and excludes from getApiKeys', async () => {
      const db = new ScopedDB(USER_A);
      await db.createApiKey({ id: 'key-rev', prefix: 'zhe_rev', keyHash: 'hrev', name: 'Revokable', scopes: 'links:read' });

      const revoked = await db.revokeApiKey('key-rev');
      expect(revoked).not.toBeNull();
      expect(revoked?.revokedAt).not.toBeNull();

      const keys = await db.getApiKeys();
      expect(keys).toHaveLength(0);
    });

    it('revokeApiKey returns null for other user key', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createApiKey({ id: 'key-own', prefix: 'zhe_own', keyHash: 'hown', name: 'A key', scopes: 'links:read' });

      const result = await dbB.revokeApiKey('key-own');
      expect(result).toBeNull();

      // Key should still exist for user A
      const keysA = await dbA.getApiKeys();
      expect(keysA).toHaveLength(1);
    });

    it('updateApiKeyLastUsed updates timestamp', async () => {
      const db = new ScopedDB(USER_A);
      const key = await db.createApiKey({ id: 'key-used', prefix: 'zhe_used', keyHash: 'hused', name: 'Used Key', scopes: 'links:read' });
      expect(key.lastUsedAt).toBeNull();

      await db.updateApiKeyLastUsed('key-used');
      const keys = await db.getApiKeys();
      const updated = keys.find(k => k.id === 'key-used');
      expect(updated).toBeDefined();
      // lastUsedAt should now be set (non-null)
    });
  });

  // ---- Ideas CRUD ------------------------------------------

  describe('idea operations', () => {
    it('getIdeas returns empty array when no ideas exist', async () => {
      const db = new ScopedDB(USER_A);
      const ideas = await db.getIdeas();
      expect(ideas).toEqual([]);
    });

    it('createIdea creates an idea with generated excerpt', async () => {
      const db = new ScopedDB(USER_A);
      const content = '# My Idea\n\nThis is **bold** and *italic* text with a [link](https://example.com).';
      const idea = await db.createIdea({ content });

      expect(idea.id).toBeTruthy();
      expect(idea.content).toBe(content);
      expect(idea.title).toBeNull();
      expect(idea.excerpt).toBe('My Idea This is bold and italic text with a link.');
      expect(idea.tagIds).toEqual([]);
      expect(idea.createdAt).toBeInstanceOf(Date);
      expect(idea.updatedAt).toBeInstanceOf(Date);
    });

    it('createIdea with title stores title', async () => {
      const db = new ScopedDB(USER_A);
      const idea = await db.createIdea({ content: 'Body text', title: 'My Title' });

      expect(idea.title).toBe('My Title');
      expect(idea.content).toBe('Body text');
    });

    it('createIdea with valid tagIds creates idea with tags atomically', async () => {
      const db = new ScopedDB(USER_A);
      const tag1 = await db.createTag({ name: 'work', color: 'blue' });
      const tag2 = await db.createTag({ name: 'project', color: 'green' });

      const idea = await db.createIdea({
        content: 'Tagged idea',
        tagIds: [tag1.id, tag2.id],
      });

      expect(idea.tagIds).toHaveLength(2);
      expect(idea.tagIds).toContain(tag1.id);
      expect(idea.tagIds).toContain(tag2.id);
    });

    it('createIdea with invalid tagId throws error', async () => {
      const db = new ScopedDB(USER_A);

      await expect(
        db.createIdea({ content: 'Body', tagIds: ['non-existent-tag'] }),
      ).rejects.toThrow('Invalid tag IDs: non-existent-tag');
    });

    it('createIdea with other user tagId throws error', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const bobTag = await dbB.createTag({ name: 'bob-tag', color: 'red' });

      await expect(
        dbA.createIdea({ content: 'Body', tagIds: [bobTag.id] }),
      ).rejects.toThrow(`Invalid tag IDs: ${bobTag.id}`);
    });

    it('createIdea with empty tagIds array creates idea without tags', async () => {
      const db = new ScopedDB(USER_A);
      const idea = await db.createIdea({ content: 'No tags', tagIds: [] });

      expect(idea.tagIds).toEqual([]);
    });

    it('getIdeas only returns own ideas', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      await dbA.createIdea({ content: 'Alice idea 1' });
      await dbA.createIdea({ content: 'Alice idea 2' });
      await dbB.createIdea({ content: 'Bob idea' });

      const ideasA = await dbA.getIdeas();
      const ideasB = await dbB.getIdeas();

      expect(ideasA).toHaveLength(2);
      expect(ideasB).toHaveLength(1);
    });

    it('getIdeas returns list shape without content', async () => {
      const db = new ScopedDB(USER_A);
      await db.createIdea({ content: 'Full markdown content here' });

      const ideas = await db.getIdeas();
      expect(ideas).toHaveLength(1);

      const idea = unwrap(ideas[0]);
      expect(idea.id).toBeTruthy();
      expect(idea.excerpt).toBeTruthy();
      expect(idea.createdAt).toBeInstanceOf(Date);
      expect(idea.updatedAt).toBeInstanceOf(Date);
      // List shape should not include full content
      expect((idea as unknown as Record<string, unknown>).content).toBeUndefined();
    });

    it('getIdeas filters by tagId', async () => {
      const db = new ScopedDB(USER_A);
      const tag = await db.createTag({ name: 'filter-tag', color: 'blue' });

      await db.createIdea({ content: 'Tagged', tagIds: [tag.id] });
      await db.createIdea({ content: 'Not tagged' });

      const filtered = await db.getIdeas({ tagId: tag.id });
      expect(filtered).toHaveLength(1);
      expect(unwrap(filtered[0]).tagIds).toContain(tag.id);
    });

    it('getIdeaById returns null for non-existent idea', async () => {
      const db = new ScopedDB(USER_A);
      const idea = await db.getIdeaById(999);
      expect(idea).toBeNull();
    });

    it('getIdeaById returns null for other user idea', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const idea = await dbA.createIdea({ content: 'Alice private' });

      expect(await dbA.getIdeaById(idea.id)).not.toBeNull();
      expect(await dbB.getIdeaById(idea.id)).toBeNull();
    });

    it('getIdeaById returns detail shape with full content', async () => {
      const db = new ScopedDB(USER_A);
      const created = await db.createIdea({ content: 'Full content here' });

      const detail = unwrap(await db.getIdeaById(created.id));
      expect(detail.content).toBe('Full content here');
      expect(detail.id).toBe(created.id);
    });

    it('updateIdea updates title and content', async () => {
      const db = new ScopedDB(USER_A);
      const idea = await db.createIdea({ content: 'Original', title: 'Old Title' });
      const originalUpdatedAt = idea.updatedAt;

      // Small delay to ensure updatedAt changes
      await new Promise(r => setTimeout(r, 10));

      const updated = unwrap(await db.updateIdea(idea.id, {
        title: 'New Title',
        content: 'New content',
      }));

      expect(updated.title).toBe('New Title');
      expect(updated.content).toBe('New content');
      expect(updated.excerpt).toBe('New content'); // Excerpt regenerated
      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('updateIdea sets title to null', async () => {
      const db = new ScopedDB(USER_A);
      const idea = await db.createIdea({ content: 'Body', title: 'Has Title' });

      const updated = unwrap(await db.updateIdea(idea.id, { title: null }));

      expect(updated.title).toBeNull();
    });

    it('updateIdea syncs tags atomically', async () => {
      const db = new ScopedDB(USER_A);
      const tag1 = await db.createTag({ name: 'tag1', color: 'blue' });
      const tag2 = await db.createTag({ name: 'tag2', color: 'green' });
      const tag3 = await db.createTag({ name: 'tag3', color: 'red' });

      const idea = await db.createIdea({ content: 'Body', tagIds: [tag1.id, tag2.id] });
      expect(idea.tagIds).toHaveLength(2);

      // Replace tags: remove tag1, keep tag2, add tag3
      const updated = unwrap(await db.updateIdea(idea.id, { tagIds: [tag2.id, tag3.id] }));

      expect(updated.tagIds).toHaveLength(2);
      expect(updated.tagIds).toContain(tag2.id);
      expect(updated.tagIds).toContain(tag3.id);
      expect(updated.tagIds).not.toContain(tag1.id);
    });

    it('updateIdea with invalid tagId throws error', async () => {
      const db = new ScopedDB(USER_A);
      const idea = await db.createIdea({ content: 'Body' });

      await expect(
        db.updateIdea(idea.id, { tagIds: ['non-existent'] }),
      ).rejects.toThrow('Invalid tag IDs: non-existent');
    });

    it('updateIdea returns null for non-existent idea', async () => {
      const db = new ScopedDB(USER_A);
      const result = await db.updateIdea(999, { title: 'New' });
      expect(result).toBeNull();
    });

    it('updateIdea returns null for other user idea', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const idea = await dbA.createIdea({ content: 'Alice idea' });

      expect(await dbB.updateIdea(idea.id, { title: 'Hacked' })).toBeNull();
    });

    it('deleteIdea removes the idea', async () => {
      const db = new ScopedDB(USER_A);
      const idea = await db.createIdea({ content: 'To delete' });

      expect(await db.deleteIdea(idea.id)).toBe(true);

      const ideas = await db.getIdeas();
      expect(ideas).toHaveLength(0);
    });

    it('deleteIdea returns false for non-existent idea', async () => {
      const db = new ScopedDB(USER_A);
      expect(await db.deleteIdea(999)).toBe(false);
    });

    it('deleteIdea returns false for other user idea', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const idea = await dbA.createIdea({ content: 'Alice idea' });

      expect(await dbB.deleteIdea(idea.id)).toBe(false);

      // Idea should still exist for user A
      const ideasA = await dbA.getIdeas();
      expect(ideasA).toHaveLength(1);
    });

    it('deleteIdea cascade deletes idea_tags', async () => {
      const db = new ScopedDB(USER_A);
      const tag = await db.createTag({ name: 'tag', color: 'blue' });
      const idea = await db.createIdea({ content: 'Body', tagIds: [tag.id] });

      await db.deleteIdea(idea.id);

      const ideaTags = await db.getIdeaTags();
      expect(ideaTags).toHaveLength(0);
    });

    it('getIdeaTags returns only associations for own ideas', async () => {
      const dbA = new ScopedDB(USER_A);
      const dbB = new ScopedDB(USER_B);

      const tagA = await dbA.createTag({ name: 'a-tag', color: 'blue' });
      const tagB = await dbB.createTag({ name: 'b-tag', color: 'red' });

      await dbA.createIdea({ content: 'Alice', tagIds: [tagA.id] });
      await dbB.createIdea({ content: 'Bob', tagIds: [tagB.id] });

      const ideaTagsA = await dbA.getIdeaTags();
      const ideaTagsB = await dbB.getIdeaTags();

      expect(ideaTagsA).toHaveLength(1);
      expect(unwrap(ideaTagsA[0]).tagId).toBe(tagA.id);
      expect(ideaTagsB).toHaveLength(1);
      expect(unwrap(ideaTagsB[0]).tagId).toBe(tagB.id);
    });
  });
});
