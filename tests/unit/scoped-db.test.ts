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
  });
});
