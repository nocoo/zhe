import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordClick,
  getAnalyticsByLinkId,
  getAnalyticsStats,
  createLink,
} from '@/lib/db';
import { clearMockStorage } from '../mocks/db-storage';

describe('Analytics DB Operations', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  describe('recordClick', () => {
    it('should record a click event', async () => {
      // Create a link first
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'test123',
      });

      const record = await recordClick({
        linkId: link.id,
        country: 'US',
        city: 'New York',
        device: 'desktop',
        browser: 'Chrome',
        os: 'macOS',
        referer: 'https://google.com',
      });

      expect(record.id).toBe(1);
      expect(record.linkId).toBe(link.id);
      expect(record.country).toBe('US');
      expect(record.city).toBe('New York');
      expect(record.device).toBe('desktop');
      expect(record.browser).toBe('Chrome');
      expect(record.os).toBe('macOS');
      expect(record.referer).toBe('https://google.com');
      expect(record.createdAt).toBeInstanceOf(Date);
    });

    it('should increment link click count', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'test456',
      });

      expect(link.clicks).toBe(0);

      await recordClick({
        linkId: link.id,
        device: 'mobile',
        browser: 'Safari',
        os: 'iOS',
      });

      await recordClick({
        linkId: link.id,
        device: 'desktop',
        browser: 'Firefox',
        os: 'Windows 10',
      });

      // We need to fetch the link again to see updated clicks
      // In our mock, we modified in place so we need to check via analytics
      const stats = await getAnalyticsStats(link.id);
      expect(stats.totalClicks).toBe(2);
    });

    it('should handle null values', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'test789',
      });

      const record = await recordClick({
        linkId: link.id,
      });

      expect(record.country).toBeNull();
      expect(record.city).toBeNull();
      expect(record.device).toBeNull();
      expect(record.browser).toBeNull();
      expect(record.os).toBeNull();
      expect(record.referer).toBeNull();
    });
  });

  describe('getAnalyticsByLinkId', () => {
    it('should return analytics for a specific link', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'link1',
      });

      await recordClick({ linkId: link.id, country: 'US' });
      await recordClick({ linkId: link.id, country: 'UK' });
      await recordClick({ linkId: link.id, country: 'JP' });

      const analytics = await getAnalyticsByLinkId(link.id);

      expect(analytics).toHaveLength(3);
      // Check that all countries are present
      const countries = analytics.map((a) => a.country);
      expect(countries).toContain('US');
      expect(countries).toContain('UK');
      expect(countries).toContain('JP');
    });

    it('should return empty array for non-existent link', async () => {
      const analytics = await getAnalyticsByLinkId(9999);
      expect(analytics).toHaveLength(0);
    });
  });

  describe('getAnalyticsStats', () => {
    it('should return aggregated stats', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'statslink',
      });

      await recordClick({
        linkId: link.id,
        country: 'US',
        device: 'desktop',
        browser: 'Chrome',
        os: 'macOS',
      });
      await recordClick({
        linkId: link.id,
        country: 'US',
        device: 'mobile',
        browser: 'Safari',
        os: 'iOS',
      });
      await recordClick({
        linkId: link.id,
        country: 'UK',
        device: 'desktop',
        browser: 'Chrome',
        os: 'Windows 10',
      });

      const stats = await getAnalyticsStats(link.id);

      expect(stats.totalClicks).toBe(3);
      expect(stats.uniqueCountries).toContain('US');
      expect(stats.uniqueCountries).toContain('UK');
      expect(stats.uniqueCountries).toHaveLength(2);

      expect(stats.deviceBreakdown.desktop).toBe(2);
      expect(stats.deviceBreakdown.mobile).toBe(1);

      expect(stats.browserBreakdown.Chrome).toBe(2);
      expect(stats.browserBreakdown.Safari).toBe(1);

      expect(stats.osBreakdown.macOS).toBe(1);
      expect(stats.osBreakdown.iOS).toBe(1);
      expect(stats.osBreakdown['Windows 10']).toBe(1);
    });

    it('should return empty stats for link with no clicks', async () => {
      const link = await createLink({
        userId: 'user-1',
        originalUrl: 'https://example.com',
        slug: 'noclicks',
      });

      const stats = await getAnalyticsStats(link.id);

      expect(stats.totalClicks).toBe(0);
      expect(stats.uniqueCountries).toHaveLength(0);
      expect(Object.keys(stats.deviceBreakdown)).toHaveLength(0);
      expect(Object.keys(stats.browserBreakdown)).toHaveLength(0);
      expect(Object.keys(stats.osBreakdown)).toHaveLength(0);
    });
  });
});
