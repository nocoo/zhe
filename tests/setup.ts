import '@testing-library/jest-dom/vitest';
import { vi, beforeEach } from 'vitest';

// Stub `server-only` so server modules can be imported in Vitest (jsdom)
vi.mock('server-only', () => ({}));

// Polyfill localStorage for Node.js 25+ where --localstorage-file may interfere with jsdom
// Create persistent mock storage that survives vi.unstubAllGlobals()
const mockStorage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
  key: (index: number) => Array.from(mockStorage.keys())[index] ?? null,
  get length() { return mockStorage.size; },
};

// Apply localStorage mock before each test to ensure it survives vi.unstubAllGlobals()
beforeEach(() => {
  if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  }
});

// Polyfill ResizeObserver for jsdom (required by cmdk)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Polyfill Element.scrollIntoView for jsdom (required by cmdk)
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = function () {};
}

// Polyfill pointer capture methods for jsdom (required by Radix Select)
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = function () { return false; };
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = function () {};
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = function () {};
}

// Re-export clearMockStorage for tests
export { clearMockStorage } from './mocks/db-storage';

// Mock the D1 client with in-memory storage
vi.mock('@/lib/db/d1-client', async () => {
  const { getMockLinks, getMockAnalytics, getMockUploads, getMockFolders, getMockWebhooks, getMockTags, getMockLinkTags, getMockUserSettings, getMockTweetCache, getMockApiKeys, getMockIdeas, getMockIdeaTags, getNextLinkId, getNextAnalyticsId, getNextUploadId, getNextWebhookId, getNextIdeaId } = await import('./mocks/db-storage');

  // Track last_insert_rowid for batch operations
  let lastInsertRowId = 0;

  const queryFn = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const mockLinks = getMockLinks();
      const mockAnalytics = getMockAnalytics();
      const mockUploads = getMockUploads();
      const mockFolders = getMockFolders();
      const mockWebhooks = getMockWebhooks();
      
      // Parse SQL and simulate D1 responses
      const sqlLower = sql.toLowerCase().trim();
      
      // Liveness probe: SELECT 1
      if (sqlLower === 'select 1 as result') {
        return [{ result: 1 }] as T[];
      }
      
      // INSERT INTO links
      if (sqlLower.startsWith('insert into links')) {
        const [userId, folderId, originalUrl, slug, isCustom, expiresAt, clicks, note, screenshotUrl, createdAt] = params;
        // Enforce UNIQUE constraint on slug (matches real D1 behaviour)
        if (mockLinks.has(slug as string)) {
          throw new Error('UNIQUE constraint failed: links.slug');
        }
        const id = getNextLinkId();
        const link = {
          id,
          user_id: userId,
          folder_id: folderId,
          original_url: originalUrl,
          slug,
          is_custom: isCustom,
          expires_at: expiresAt,
          clicks: clicks ?? 0,
          meta_title: null,
          meta_description: null,
          meta_favicon: null,
          screenshot_url: screenshotUrl ?? null,
          note: note ?? null,
          created_at: createdAt,
        };
        mockLinks.set(slug as string, link as unknown as import('@/lib/db/schema').Link);
        return [link] as T[];
      }
      
      // SELECT id, slug, original_url, expires_at FROM links (getAllLinksForKV — no WHERE)
      if (sqlLower.startsWith('select') && sqlLower.includes('from links') && !sqlLower.includes('where')) {
        const results: unknown[] = [];
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          results.push(rawLink);
        }
        return results as T[];
      }

      // SELECT COUNT(1) FROM links WHERE slug = ? (slugExists)
      if (sqlLower.includes('count(1)') && sqlLower.includes('from links') && sqlLower.includes('where slug = ?')) {
        const [slug] = params;
        let cnt = 0;
        for (const [linkSlug] of mockLinks.entries()) {
          if (linkSlug === slug) { cnt = 1; break; }
        }
        return [{ cnt }] as T[];
      }

      // SELECT FROM links WHERE slug = ?
      if (sqlLower.includes('from links') && sqlLower.includes('where slug = ?')) {
        const [slug] = params;
        for (const [linkSlug, link] of mockLinks.entries()) {
          if (linkSlug === slug) {
            return [link] as T[];
          }
        }
        return [];
      }
      
      // SELECT FROM links WHERE user_id = ? AND original_url = ? (idempotency lookup)
      if (sqlLower.includes('from links') && sqlLower.includes('where user_id = ?') && sqlLower.includes('and original_url = ?')) {
        const [userId, url] = params;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId && rawLink.original_url === url) {
            return [link] as T[];
          }
        }
        return [];
      }

      // SELECT COUNT(*) AS cnt, COALESCE(SUM(clicks), 0) AS total_clicks FROM links WHERE user_id = ? (getWebhookStats)
      if (sqlLower.includes('count(*)') && sqlLower.includes('as cnt') && sqlLower.includes('from links') && sqlLower.includes('where user_id = ?')) {
        const [userId] = params;
        let cnt = 0;
        let totalClicks = 0;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId) {
            cnt++;
            totalClicks += (rawLink.clicks as number) ?? 0;
          }
        }
        return [{ cnt, total_clicks: totalClicks }] as T[];
      }

      // SELECT slug, original_url, clicks, created_at FROM links WHERE user_id = ? ORDER BY created_at DESC LIMIT 5 (getWebhookStats)
      if (sqlLower.includes('from links') && sqlLower.includes('where user_id = ?') && sqlLower.includes('order by created_at desc') && sqlLower.includes('limit 5')) {
        const [userId] = params;
        const results: unknown[] = [];
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId) {
            results.push({ slug: rawLink.slug, original_url: rawLink.original_url, clicks: (rawLink.clicks as number) ?? 0, created_at: rawLink.created_at });
          }
        }
        results.sort((a, b) => ((b as Record<string, unknown>).created_at as number) - ((a as Record<string, unknown>).created_at as number));
        return results.slice(0, 5) as T[];
      }

      // SELECT COUNT(*) AS total_links, COALESCE(SUM(clicks), 0) AS total_clicks FROM links WHERE user_id = ?
      if (sqlLower.includes('count(*)') && sqlLower.includes('total_links') && sqlLower.includes('from links') && sqlLower.includes('where user_id = ?')) {
        const [userId] = params;
        let totalLinks = 0;
        let totalClicks = 0;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId) {
            totalLinks++;
            totalClicks += (rawLink.clicks as number) ?? 0;
          }
        }
        return [{ total_links: totalLinks, total_clicks: totalClicks }] as T[];
      }

      // SELECT slug, original_url, clicks FROM links WHERE user_id = ? ORDER BY clicks DESC
      if (sqlLower.includes('from links') && sqlLower.includes('where user_id = ?') && sqlLower.includes('order by clicks desc')) {
        const [userId] = params;
        const results: unknown[] = [];
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId) {
            results.push({ slug: rawLink.slug, original_url: rawLink.original_url, clicks: (rawLink.clicks as number) ?? 0 });
          }
        }
        results.sort((a, b) => ((b as Record<string, unknown>).clicks as number) - ((a as Record<string, unknown>).clicks as number));
        return results as T[];
      }

      // SELECT FROM links WHERE user_id = ? (also handles l.user_id from aliased queries)
      if (sqlLower.startsWith('select') && sqlLower.includes('from links') && (sqlLower.includes('where user_id = ?') || sqlLower.includes('where l.user_id = ?'))) {
        // Find the userId parameter (first param after any search params)
        // For dynamic queries, userId is always the first param
        const userId = params[0];
        const results: unknown[] = [];

        // Check if this is a tag filter query (has JOIN link_tags)
        const hasTagFilter = sqlLower.includes('join link_tags');
        const linkTags = hasTagFilter ? getMockLinkTags() : null;

        // Find query and tagId params based on SQL patterns
        let queryPattern: string | null = null;
        let folderId: string | null = null;
        let tagId: string | null = null;
        const folderIsNull = sqlLower.includes('folder_id is null');

        let paramIndex = 1; // Start after userId

        // Check for LIKE patterns (keyword search)
        if (sqlLower.includes('like ?')) {
          queryPattern = params[paramIndex] as string;
          paramIndex += 5; // 5 LIKE params for search
        }

        // Check for folder_id = ? (not IS NULL)
        if (sqlLower.includes('folder_id = ?')) {
          folderId = params[paramIndex] as string;
          paramIndex++;
        }

        // Check for tag_id = ?
        if (sqlLower.includes('tag_id = ?')) {
          tagId = params[paramIndex] as string;
        }

        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;

          // Must match userId
          if (rawLink.user_id !== userId) continue;

          // Keyword search filter
          if (queryPattern) {
            const search = queryPattern.replace(/%/g, '').toLowerCase();
            const matchesSearch =
              (rawLink.slug as string || '').toLowerCase().includes(search) ||
              (rawLink.original_url as string || '').toLowerCase().includes(search) ||
              (rawLink.note as string || '').toLowerCase().includes(search) ||
              (rawLink.meta_title as string || '').toLowerCase().includes(search) ||
              (rawLink.meta_description as string || '').toLowerCase().includes(search);
            if (!matchesSearch) continue;
          }

          // Folder filter
          if (folderIsNull && rawLink.folder_id !== null) continue;
          if (folderId && rawLink.folder_id !== folderId) continue;

          // Tag filter
          if (tagId && linkTags) {
            const hasTag = linkTags.some(lt => lt.link_id === rawLink.id && lt.tag_id === tagId);
            if (!hasTag) continue;
          }

          results.push(link);
        }
        // Parse ORDER BY clause for sorting
        const orderByMatch = sqlLower.match(/order by (\S+)\s+(asc|desc)/i);
        const sortColumn = orderByMatch?.[1] || 'l.created_at';
        const sortOrder = orderByMatch?.[2]?.toLowerCase() || 'desc';

        results.sort((a, b) => {
          let aVal: number;
          let bVal: number;
          if (sortColumn === 'l.clicks') {
            aVal = (a as Record<string, unknown>).clicks as number;
            bVal = (b as Record<string, unknown>).clicks as number;
          } else {
            aVal = (a as Record<string, unknown>).created_at as number;
            bVal = (b as Record<string, unknown>).created_at as number;
          }
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        });
        return results as T[];
      }
      
      // DELETE FROM links WHERE id = ? AND user_id = ?
      if (sqlLower.startsWith('delete from links') && sqlLower.includes('where id = ?')) {
        const [id, userId] = params;
        for (const [slug, link] of mockLinks.entries()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === id && rawLink.user_id === userId) {
            mockLinks.delete(slug);
            // Cascade: remove associated link_tags entries
            const linkTags = getMockLinkTags();
            for (let i = linkTags.length - 1; i >= 0; i--) {
              const entry = linkTags[i];
              if (entry && entry.link_id === id) {
                linkTags.splice(i, 1);
              }
            }
            return [{ id }] as T[];
          }
        }
        return [];
      }

      // UPDATE links SET clicks = clicks + 1 WHERE id = ? (simple increment, no user_id)
      if (sqlLower.includes('update links set clicks = clicks + 1') && !sqlLower.includes('user_id')) {
        const [linkId] = params;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === linkId) {
            rawLink.clicks = ((rawLink.clicks as number) || 0) + 1;
            return [];
          }
        }
        return [];
      }
      
      // UPDATE links SET ... WHERE id = ? AND user_id = ? (scoped update)
      if (sqlLower.startsWith('update links set') && sqlLower.includes('where id = ?')) {
        // Extract id and userId from end of params
        const id = params[params.length - 2];
        const userId = params[params.length - 1];
        
        for (const [_slug, link] of mockLinks.entries()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === id && rawLink.user_id === userId) {
            // Parse SET clause to update fields
            const setMatch = sql.match(/set\s+(.+?)\s+where/i);
            if (setMatch && setMatch[1]) {
              const setClauses = setMatch[1].split(',').map(s => s.trim());
              let paramIndex = 0;
              for (const clause of setClauses) {
                const field = (clause.split('=')[0] ?? '').trim();
                if (field === 'original_url') {
                  rawLink.original_url = params[paramIndex];
                } else if (field === 'folder_id') {
                  rawLink.folder_id = params[paramIndex];
                } else if (field === 'expires_at') {
                  rawLink.expires_at = params[paramIndex];
                } else if (field === 'meta_title') {
                  rawLink.meta_title = params[paramIndex];
                } else if (field === 'meta_description') {
                  rawLink.meta_description = params[paramIndex];
                } else if (field === 'meta_favicon') {
                  rawLink.meta_favicon = params[paramIndex];
                } else if (field === 'screenshot_url') {
                  rawLink.screenshot_url = params[paramIndex];
                } else if (field === 'note') {
                  rawLink.note = params[paramIndex];
                } else if (field === 'slug') {
                  const oldSlug = rawLink.slug as string;
                  const newSlug = params[paramIndex] as string;
                  rawLink.slug = newSlug;
                  // Re-key the mockLinks map since it's keyed by slug
                  if (oldSlug !== newSlug) {
                    mockLinks.delete(oldSlug);
                    mockLinks.set(newSlug, link);
                  }
                } else if (field === 'is_custom') {
                  rawLink.is_custom = params[paramIndex];
                } else if (field === 'clicks') {
                  // Handle increment: clicks = clicks + 1
                  if (clause.includes('clicks + 1')) {
                    rawLink.clicks = ((rawLink.clicks as number) || 0) + 1;
                    continue; // Don't increment paramIndex
                  }
                }
                paramIndex++;
              }
            }
            return [rawLink] as T[];
          }
        }
        return [];
      }
      
      // INSERT INTO analytics
      if (sqlLower.startsWith('insert into analytics')) {
        const [linkId, country, city, device, browser, os, referer, source, createdAt] = params;
        const id = getNextAnalyticsId();
        const record = {
          id,
          link_id: linkId,
          country,
          city,
          device,
          browser,
          os,
          referer,
          source: source ?? null,
          created_at: createdAt,
        };
        mockAnalytics.push(record as unknown as import('@/lib/db/schema').Analytics);
        return [record] as T[];
      }
      
      // SELECT date(...) as date, COUNT(*) as clicks, SUM(...) as origin_clicks, SUM(...) as worker_clicks FROM analytics a JOIN links ... GROUP BY date (overview click trend)
      if (sqlLower.includes('count(*)') && sqlLower.includes('from analytics') && sqlLower.includes('join links') && sqlLower.includes('group by date') && !sqlLower.includes('a.link_id = ?')) {
        const [userId] = params;
        const userLinkIds = new Set<number>();
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId) userLinkIds.add(rawLink.id as number);
        }
        const dateCounts: Record<string, { clicks: number; origin_clicks: number; worker_clicks: number }> = {};
        for (const a of mockAnalytics) {
          const rawA = a as unknown as Record<string, unknown>;
          if (userLinkIds.has(rawA.link_id as number)) {
            const date = new Date(rawA.created_at as number).toISOString().slice(0, 10);
            if (!dateCounts[date]) dateCounts[date] = { clicks: 0, origin_clicks: 0, worker_clicks: 0 };
            dateCounts[date].clicks += 1;
            const source = rawA.source as string | null;
            if (source === 'worker') {
              dateCounts[date].worker_clicks += 1;
            } else {
              // source === 'origin' or NULL (legacy) both count as origin
              dateCounts[date].origin_clicks += 1;
            }
          }
        }
        return Object.entries(dateCounts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, counts]) => ({ date, clicks: counts.clicks, origin_clicks: counts.origin_clicks, worker_clicks: counts.worker_clicks })) as T[];
      }

      // SELECT a.device/browser/os, COUNT(*) as count FROM analytics a JOIN links ... GROUP BY ... (overview breakdown, no link_id filter)
      if (sqlLower.includes('count(*)') && sqlLower.includes('from analytics') && sqlLower.includes('join links') && sqlLower.includes('group by') && !sqlLower.includes('a.link_id = ?')) {
        const [userId] = params;
        const userLinkIds = new Set<number>();
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId) userLinkIds.add(rawLink.id as number);
        }
        let field: string;
        if (sqlLower.includes('group by a.device')) field = 'device';
        else if (sqlLower.includes('group by a.browser')) field = 'browser';
        else if (sqlLower.includes('group by a.os')) field = 'os';
        else return [] as T[];

        const counts: Record<string, number> = {};
        for (const a of mockAnalytics) {
          const rawA = a as unknown as Record<string, unknown>;
          if (userLinkIds.has(rawA.link_id as number) && rawA[field] != null) {
            const val = rawA[field] as string;
            counts[val] = (counts[val] || 0) + 1;
          }
        }
        return Object.entries(counts).map(([key, count]) => ({ [field]: key, count })) as T[];
      }

      // SELECT a.* FROM analytics a JOIN links l ON ... WHERE l.user_id = ?
      // (ScopedDB bulk analytics query — all analytics for a user, no specific link_id filter)
      if (sqlLower.includes('from analytics') && sqlLower.includes('join links') && sqlLower.includes('user_id') && !sqlLower.includes('a.link_id = ?')) {
        const [userId] = params;
        // Collect all link IDs owned by this user
        const userLinkIds = new Set<number>();
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId) {
            userLinkIds.add(rawLink.id as number);
          }
        }
        const results = mockAnalytics.filter(a => {
          const rawA = a as unknown as Record<string, unknown>;
          return userLinkIds.has(rawA.link_id as number);
        });
        results.sort((a, b) => {
          const aTime = (a as unknown as Record<string, unknown>).created_at as number;
          const bTime = (b as unknown as Record<string, unknown>).created_at as number;
          return bTime - aTime;
        });
        return results as T[];
      }

      // SELECT COUNT(*) as total FROM analytics a JOIN links ... (scoped count)
      if (sqlLower.includes('select count(*)') && sqlLower.includes('from analytics') && sqlLower.includes('join links') && sqlLower.includes('a.link_id = ?')) {
        const [linkId, userId] = params;
        // Verify link ownership
        let linkOwned = false;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === linkId && rawLink.user_id === userId) { linkOwned = true; break; }
        }
        if (!linkOwned) return [{ total: 0 }] as T[];
        const count = mockAnalytics.filter(a => (a as unknown as Record<string, unknown>).link_id === linkId).length;
        return [{ total: count }] as T[];
      }

      // SELECT DISTINCT a.country FROM analytics a JOIN links ... (scoped countries)
      if (sqlLower.includes('select distinct') && sqlLower.includes('country') && sqlLower.includes('from analytics') && sqlLower.includes('join links') && sqlLower.includes('a.link_id = ?')) {
        const [linkId, userId] = params;
        let linkOwned = false;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === linkId && rawLink.user_id === userId) { linkOwned = true; break; }
        }
        if (!linkOwned) return [] as T[];
        const countries = new Set<string>();
        for (const a of mockAnalytics) {
          const rawA = a as unknown as Record<string, unknown>;
          if (rawA.link_id === linkId && rawA.country != null) countries.add(rawA.country as string);
        }
        return Array.from(countries).map(c => ({ country: c })) as T[];
      }

      // SELECT a.device/browser/os, COUNT(*) as count FROM analytics a JOIN links ... GROUP BY ... (scoped breakdown)
      if (sqlLower.includes('count(*)') && sqlLower.includes('from analytics') && sqlLower.includes('join links') && sqlLower.includes('group by') && sqlLower.includes('a.link_id = ?')) {
        const [linkId, userId] = params;
        let linkOwned = false;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === linkId && rawLink.user_id === userId) { linkOwned = true; break; }
        }
        if (!linkOwned) return [] as T[];

        let field: string;
        if (sqlLower.includes('group by a.device')) field = 'device';
        else if (sqlLower.includes('group by a.browser')) field = 'browser';
        else if (sqlLower.includes('group by a.os')) field = 'os';
        else return [] as T[];

        const counts: Record<string, number> = {};
        for (const a of mockAnalytics) {
          const rawA = a as unknown as Record<string, unknown>;
          if (rawA.link_id === linkId && rawA[field] != null) {
            const val = rawA[field] as string;
            counts[val] = (counts[val] || 0) + 1;
          }
        }
        return Object.entries(counts).map(([key, count]) => ({ [field]: key, count })) as T[];
      }

      // SELECT a.* FROM analytics a JOIN links l ON ... WHERE a.link_id = ? AND l.user_id = ?
      // (ScopedDB analytics query with ownership check — single link)
      if (sqlLower.includes('from analytics') && sqlLower.includes('join links') && sqlLower.includes('user_id')) {
        const [linkId, userId] = params;
        // Verify the link belongs to this user
        let linkOwned = false;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === linkId && rawLink.user_id === userId) {
            linkOwned = true;
            break;
          }
        }
        if (!linkOwned) return [];
        
        const results = mockAnalytics.filter(a => {
          const rawA = a as unknown as Record<string, unknown>;
          return rawA.link_id === linkId;
        });
        results.sort((a, b) => {
          const aTime = (a as unknown as Record<string, unknown>).created_at as number;
          const bTime = (b as unknown as Record<string, unknown>).created_at as number;
          return bTime - aTime;
        });
        return results as T[];
      }

      // SELECT COUNT(*) as total FROM analytics WHERE link_id = ?
      if (sqlLower.includes('select count(*)') && sqlLower.includes('from analytics') && sqlLower.includes('where link_id = ?') && !sqlLower.includes('join links')) {
        const [linkId] = params;
        const count = mockAnalytics.filter(a => {
          const rawA = a as unknown as Record<string, unknown>;
          return rawA.link_id === linkId;
        }).length;
        return [{ total: count }] as T[];
      }

      // SELECT DISTINCT country FROM analytics WHERE link_id = ? AND country IS NOT NULL
      if (sqlLower.includes('select distinct') && sqlLower.includes('country') && sqlLower.includes('from analytics') && sqlLower.includes('where link_id = ?') && !sqlLower.includes('join links')) {
        const [linkId] = params;
        const countries = new Set<string>();
        for (const a of mockAnalytics) {
          const rawA = a as unknown as Record<string, unknown>;
          if (rawA.link_id === linkId && rawA.country != null) {
            countries.add(rawA.country as string);
          }
        }
        return Array.from(countries).map(c => ({ country: c })) as T[];
      }

      // SELECT device/browser/os, COUNT(*) as count FROM analytics WHERE link_id = ? AND ... GROUP BY ...
      if (sqlLower.includes('count(*)') && sqlLower.includes('from analytics') && sqlLower.includes('group by') && sqlLower.includes('where link_id = ?') && !sqlLower.includes('join links')) {
        const [linkId] = params;
        // Determine which field is being grouped
        let field: string;
        if (sqlLower.includes('group by device')) field = 'device';
        else if (sqlLower.includes('group by browser')) field = 'browser';
        else if (sqlLower.includes('group by os')) field = 'os';
        else return [] as T[];

        const counts: Record<string, number> = {};
        for (const a of mockAnalytics) {
          const rawA = a as unknown as Record<string, unknown>;
          if (rawA.link_id === linkId && rawA[field] != null) {
            const val = rawA[field] as string;
            counts[val] = (counts[val] || 0) + 1;
          }
        }
        return Object.entries(counts).map(([key, count]) => ({ [field]: key, count })) as T[];
      }

      // SELECT FROM analytics WHERE link_id = ? (unscoped — used by getAnalyticsByLinkId)
      if (sqlLower.includes('from analytics') && sqlLower.includes('where link_id = ?')) {
        const [linkId] = params;
        const results = mockAnalytics.filter(a => {
          const rawA = a as unknown as Record<string, unknown>;
          return rawA.link_id === linkId;
        });
        // Sort by created_at DESC
        results.sort((a, b) => {
          const aTime = (a as unknown as Record<string, unknown>).created_at as number;
          const bTime = (b as unknown as Record<string, unknown>).created_at as number;
          return bTime - aTime;
        });
        return results as T[];
      }
      
      // SELECT FROM links WHERE id = ? AND user_id = ?
      // Also handles: SELECT * FROM links WHERE id IN (...) AND user_id = ?
      if (sqlLower.includes('from links') && sqlLower.includes('where id') && sqlLower.includes('user_id = ?')) {
        // Check if this is an IN (...) query (getLinksByIds)
        if (sqlLower.includes('id in (')) {
          const userId = params[params.length - 1];
          const ids = params.slice(0, -1);
          const results: unknown[] = [];
          for (const link of mockLinks.values()) {
            const rawLink = link as unknown as Record<string, unknown>;
            if (ids.includes(rawLink.id) && rawLink.user_id === userId) {
              results.push(link);
            }
          }
          return results as T[];
        }
        const [id, userId] = params;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === id && rawLink.user_id === userId) {
            return [link] as T[];
          }
        }
        return [];
      }

      // ---- Uploads ----

      // INSERT INTO uploads
      if (sqlLower.startsWith('insert into uploads')) {
        const [userId, key, fileName, fileType, fileSize, publicUrl, createdAt] = params;
        const id = getNextUploadId();
        const upload = {
          id,
          user_id: userId,
          key,
          file_name: fileName,
          file_type: fileType,
          file_size: fileSize,
          public_url: publicUrl,
          created_at: createdAt,
        };
        mockUploads.set(id, upload as unknown as import('@/lib/db/schema').Upload);
        return [upload] as T[];
      }

      // SELECT COUNT(*) AS total_uploads, COALESCE(SUM(file_size), 0) AS total_storage FROM uploads WHERE user_id = ?
      if (sqlLower.includes('count(*)') && sqlLower.includes('total_uploads') && sqlLower.includes('from uploads') && sqlLower.includes('where user_id = ?')) {
        const [userId] = params;
        let totalUploads = 0;
        let totalStorage = 0;
        for (const upload of mockUploads.values()) {
          const raw = upload as unknown as Record<string, unknown>;
          if (raw.user_id === userId) {
            totalUploads++;
            totalStorage += (raw.file_size as number) ?? 0;
          }
        }
        return [{ total_uploads: totalUploads, total_storage: totalStorage }] as T[];
      }

      // SELECT date(...) as date, COUNT(*) as uploads FROM uploads WHERE user_id = ? GROUP BY date ORDER BY date ASC
      if (sqlLower.includes('count(*)') && sqlLower.includes('from uploads') && sqlLower.includes('where user_id = ?') && sqlLower.includes('group by date')) {
        const [userId] = params;
        const dateCounts: Record<string, number> = {};
        for (const upload of mockUploads.values()) {
          const raw = upload as unknown as Record<string, unknown>;
          if (raw.user_id === userId) {
            const date = new Date(raw.created_at as number).toISOString().slice(0, 10);
            dateCounts[date] = (dateCounts[date] || 0) + 1;
          }
        }
        return Object.entries(dateCounts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, uploads]) => ({ date, uploads })) as T[];
      }

      // SELECT file_type, COUNT(*) as count FROM uploads WHERE user_id = ? GROUP BY file_type
      if (sqlLower.includes('count(*)') && sqlLower.includes('file_type') && sqlLower.includes('from uploads') && sqlLower.includes('where user_id = ?') && sqlLower.includes('group by file_type')) {
        const [userId] = params;
        const fileTypes: Record<string, number> = {};
        for (const upload of mockUploads.values()) {
          const raw = upload as unknown as Record<string, unknown>;
          if (raw.user_id === userId) {
            const ft = raw.file_type as string;
            fileTypes[ft] = (fileTypes[ft] || 0) + 1;
          }
        }
        return Object.entries(fileTypes).map(([file_type, count]) => ({ file_type, count })) as T[];
      }

      // SELECT FROM uploads WHERE user_id = ?
      if (sqlLower.includes('from uploads') && sqlLower.includes('where user_id = ?') && !sqlLower.includes('and id = ?') && !sqlLower.includes('where id = ?')) {
        const [userId] = params;
        const results: unknown[] = [];
        for (const upload of mockUploads.values()) {
          const raw = upload as unknown as Record<string, unknown>;
          if (raw.user_id === userId) {
            results.push(upload);
          }
        }
        results.sort((a, b) => {
          const aRaw = a as Record<string, unknown>;
          const bRaw = b as Record<string, unknown>;
          const timeDiff = (bRaw.created_at as number) - (aRaw.created_at as number);
          if (timeDiff !== 0) return timeDiff;
          return (bRaw.id as number) - (aRaw.id as number);
        });
        return results as T[];
      }

      // DELETE FROM uploads WHERE id = ? AND user_id = ?
      if (sqlLower.startsWith('delete from uploads') && sqlLower.includes('where id = ?')) {
        const [id, userId] = params;
        for (const [uploadId, upload] of mockUploads.entries()) {
          const raw = upload as unknown as Record<string, unknown>;
          if (raw.id === id && raw.user_id === userId) {
            mockUploads.delete(uploadId);
            return [{ id }] as T[];
          }
        }
        return [];
      }

      // SELECT FROM uploads WHERE id = ? AND user_id = ? (getUploadById or getUploadKey)
      if (sqlLower.includes('from uploads') && sqlLower.includes('where id = ?') && sqlLower.includes('and user_id = ?')) {
        const [id, userId] = params;
        for (const upload of mockUploads.values()) {
          const raw = upload as unknown as Record<string, unknown>;
          if (raw.id === id && raw.user_id === userId) {
            // If SELECT key only, return just key; otherwise return full row
            if (sqlLower.startsWith('select key')) {
              return [{ key: raw.key }] as T[];
            }
            return [upload] as T[];
          }
        }
        return [];
      }
      
      // ---- Folders ----

      // INSERT INTO folders
      if (sqlLower.startsWith('insert into folders')) {
        const [id, userId, name, icon, createdAt] = params;
        const folder = {
          id,
          user_id: userId,
          name,
          icon,
          created_at: createdAt,
        };
        mockFolders.set(id as string, folder as unknown as import('@/lib/db/schema').Folder);
        return [folder] as T[];
      }

      // SELECT FROM folders WHERE user_id = ? AND LOWER(name) = LOWER(?) (case-insensitive name lookup)
      if (sqlLower.startsWith('select') && sqlLower.includes('from folders') && sqlLower.includes('lower(name)')) {
        const [userId, name] = params;
        const lowerName = (name as string).toLowerCase();
        for (const folder of mockFolders.values()) {
          const raw = folder as unknown as Record<string, unknown>;
          if (raw.user_id === userId && (raw.name as string).toLowerCase() === lowerName) {
            return [folder] as T[];
          }
        }
        return [];
      }

      // SELECT f.*, COUNT(l.id) AS link_count FROM folders f LEFT JOIN links l ... (folders with link count)
      if (sqlLower.includes('from folders f') && sqlLower.includes('left join links') && sqlLower.includes('count(l.id)')) {
        const [userId] = params;
        const results: unknown[] = [];
        for (const folder of mockFolders.values()) {
          const raw = folder as unknown as Record<string, unknown>;
          if (raw.user_id === userId) {
            // Count links that belong to this folder
            let linkCount = 0;
            for (const link of mockLinks.values()) {
              const linkRaw = link as unknown as Record<string, unknown>;
              if (linkRaw.folder_id === raw.id) {
                linkCount++;
              }
            }
            results.push({ ...raw, link_count: linkCount });
          }
        }
        results.sort((a, b) => {
          const aTime = (a as Record<string, unknown>).created_at as number;
          const bTime = (b as Record<string, unknown>).created_at as number;
          return bTime - aTime;
        });
        return results as T[];
      }

      // SELECT FROM folders WHERE user_id = ? (list all user folders)
      if (sqlLower.startsWith('select') && sqlLower.includes('from folders') && sqlLower.includes('where user_id = ?') && !sqlLower.includes('and id = ?') && !sqlLower.includes('where id = ?')) {
        const [userId] = params;
        const results: unknown[] = [];
        for (const folder of mockFolders.values()) {
          const raw = folder as unknown as Record<string, unknown>;
          if (raw.user_id === userId) {
            results.push(folder);
          }
        }
        results.sort((a, b) => {
          const aTime = (a as Record<string, unknown>).created_at as number;
          const bTime = (b as Record<string, unknown>).created_at as number;
          return bTime - aTime;
        });
        return results as T[];
      }

      // SELECT FROM folders WHERE id = ? AND user_id = ?
      if (sqlLower.startsWith('select') && sqlLower.includes('from folders') && sqlLower.includes('where id = ?') && sqlLower.includes('and user_id = ?')) {
        const [id, userId] = params;
        for (const folder of mockFolders.values()) {
          const raw = folder as unknown as Record<string, unknown>;
          if (raw.id === id && raw.user_id === userId) {
            return [folder] as T[];
          }
        }
        return [];
      }

      // UPDATE folders SET ... WHERE id = ? AND user_id = ?
      if (sqlLower.startsWith('update folders set') && sqlLower.includes('where id = ?')) {
        const id = params[params.length - 2];
        const userId = params[params.length - 1];
        for (const folder of mockFolders.values()) {
          const raw = folder as unknown as Record<string, unknown>;
          if (raw.id === id && raw.user_id === userId) {
            const setMatch = sql.match(/set\s+(.+?)\s+where/i);
            if (setMatch && setMatch[1]) {
              const setClauses = setMatch[1].split(',').map(s => s.trim());
              let paramIndex = 0;
              for (const clause of setClauses) {
                const field = (clause.split('=')[0] ?? '').trim();
                if (field === 'name') {
                  raw.name = params[paramIndex];
                } else if (field === 'icon') {
                  raw.icon = params[paramIndex];
                }
                paramIndex++;
              }
            }
            return [raw] as T[];
          }
        }
        return [];
      }

      // DELETE FROM folders WHERE id = ? AND user_id = ?
      if (sqlLower.startsWith('delete from folders') && sqlLower.includes('where id = ?')) {
        const [id, userId] = params;
        for (const [folderId, folder] of mockFolders.entries()) {
          const raw = folder as unknown as Record<string, unknown>;
          if (raw.id === id && raw.user_id === userId) {
            mockFolders.delete(folderId);
            // Cascade: set folder_id to null on all links referencing this folder
            for (const link of mockLinks.values()) {
              const rawLink = link as unknown as Record<string, unknown>;
              if (rawLink.folder_id === id) {
                rawLink.folder_id = null;
              }
            }
            return [{ id }] as T[];
          }
        }
        return [];
      }
      
      // ---- Tags ----

      // INSERT INTO tags
      if (sqlLower.startsWith('insert into tags')) {
        const [id, userId, name, color, createdAt] = params;
        const tag = {
          id,
          user_id: userId,
          name,
          color,
          created_at: createdAt,
        };
        const mockTags = getMockTags();
        mockTags.set(id as string, tag as unknown as import('@/lib/db/schema').Tag);
        return [tag] as T[];
      }

      // SELECT FROM tags WHERE id = ? AND user_id = ? (single tag lookup)
      if (sqlLower.startsWith('select') && sqlLower.includes('from tags') && sqlLower.includes('where id = ?') && sqlLower.includes('and user_id = ?')) {
        const [id, userId] = params;
        const mockTags = getMockTags();
        for (const tag of mockTags.values()) {
          const raw = tag as unknown as Record<string, unknown>;
          if (raw.id === id && raw.user_id === userId) {
            return [tag] as T[];
          }
        }
        return [];
      }

      // SELECT FROM tags WHERE user_id = ? (list all user tags)
      if (sqlLower.startsWith('select') && sqlLower.includes('from tags') && sqlLower.includes('where user_id = ?') && !sqlLower.includes('and id = ?') && !sqlLower.includes('where id = ?') && !sqlLower.includes('and id in (')) {
        const [userId] = params;
        const mockTags = getMockTags();
        const results: unknown[] = [];
        for (const tag of mockTags.values()) {
          const raw = tag as unknown as Record<string, unknown>;
          if (raw.user_id === userId) {
            results.push(tag);
          }
        }
        results.sort((a, b) => {
          const aTime = (a as Record<string, unknown>).created_at as number;
          const bTime = (b as Record<string, unknown>).created_at as number;
          return bTime - aTime;
        });
        return results as T[];
      }

      // UPDATE tags SET ... WHERE id = ? AND user_id = ?
      if (sqlLower.startsWith('update tags set') && sqlLower.includes('where id = ?')) {
        const id = params[params.length - 2];
        const userId = params[params.length - 1];
        const mockTags = getMockTags();
        for (const tag of mockTags.values()) {
          const raw = tag as unknown as Record<string, unknown>;
          if (raw.id === id && raw.user_id === userId) {
            const setMatch = sql.match(/set\s+(.+?)\s+where/i);
            if (setMatch && setMatch[1]) {
              const setClauses = setMatch[1].split(',').map(s => s.trim());
              let paramIndex = 0;
              for (const clause of setClauses) {
                const field = (clause.split('=')[0] ?? '').trim();
                if (field === 'name') {
                  raw.name = params[paramIndex];
                } else if (field === 'color') {
                  raw.color = params[paramIndex];
                }
                paramIndex++;
              }
            }
            return [raw] as T[];
          }
        }
        return [];
      }

      // DELETE FROM tags WHERE id = ? AND user_id = ?
      if (sqlLower.startsWith('delete from tags') && sqlLower.includes('where id = ?')) {
        const [id, userId] = params;
        const mockTags = getMockTags();
        for (const [tagId, tag] of mockTags.entries()) {
          const raw = tag as unknown as Record<string, unknown>;
          if (raw.id === id && raw.user_id === userId) {
            mockTags.delete(tagId);
            // Cascade: remove associated link_tags entries
            const linkTags = getMockLinkTags();
            for (let i = linkTags.length - 1; i >= 0; i--) {
              const entry = linkTags[i];
              if (entry && entry.tag_id === id) {
                linkTags.splice(i, 1);
              }
            }
            return [{ id }] as T[];
          }
        }
        return [];
      }

      // ---- Link-Tags ----

      // SELECT t.* FROM tags t JOIN link_tags lt ... WHERE lt.link_id = ? AND l.user_id = ? (getTagsForLink)
      if (sqlLower.includes('from tags t') && sqlLower.includes('join link_tags') && sqlLower.includes('link_id = ?')) {
        const [linkId, userId] = params;
        const linkTags = getMockLinkTags();
        const mockTags = getMockTags();
        // Verify link ownership
        let linkOwned = false;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === linkId && rawLink.user_id === userId) { linkOwned = true; break; }
        }
        if (!linkOwned) return [] as T[];
        const results: unknown[] = [];
        for (const lt of linkTags) {
          if (lt.link_id === linkId) {
            for (const tag of mockTags.values()) {
              const rawTag = tag as unknown as Record<string, unknown>;
              if (rawTag.id === lt.tag_id) {
                results.push(tag);
                break;
              }
            }
          }
        }
        return results as T[];
      }

      // SELECT id FROM links WHERE id = ? AND user_id = ? (ownership check for addTagToLink)
      // This is already handled above by "SELECT FROM links WHERE id = ? AND user_id = ?"

      // SELECT id FROM tags WHERE id = ? AND user_id = ? (ownership check for addTagToLink)
      // This is already handled above by "SELECT FROM tags WHERE id = ? AND user_id = ?"

      // INSERT OR IGNORE INTO link_tags
      if (sqlLower.startsWith('insert or ignore into link_tags')) {
        const [linkId, tagId] = params;
        const linkTags = getMockLinkTags();
        // Check for duplicate (INSERT OR IGNORE semantics)
        const exists = linkTags.some(lt => lt.link_id === linkId && lt.tag_id === tagId);
        if (!exists) {
          linkTags.push({ link_id: linkId as number, tag_id: tagId as string });
        }
        return [] as T[];
      }

      // SELECT lt.* FROM link_tags lt JOIN links l ON ... WHERE l.user_id = ?
      if (sqlLower.includes('from link_tags') && sqlLower.includes('join links') && sqlLower.includes('user_id')) {
        const [userId] = params;
        const linkTags = getMockLinkTags();
        const results: unknown[] = [];
        for (const lt of linkTags) {
          // Check if the link belongs to this user
          for (const link of mockLinks.values()) {
            const rawLink = link as unknown as Record<string, unknown>;
            if (rawLink.id === lt.link_id && rawLink.user_id === userId) {
              results.push({ link_id: lt.link_id, tag_id: lt.tag_id });
              break;
            }
          }
        }
        return results as T[];
      }

      // DELETE FROM link_tags WHERE link_id = ? AND tag_id = ? AND link_id IN (SELECT id FROM links WHERE user_id = ?)
      if (sqlLower.startsWith('delete from link_tags') && sqlLower.includes('where link_id = ?') && sqlLower.includes('tag_id = ?')) {
        const [linkId, tagId, userId] = params;
        const linkTags = getMockLinkTags();
        // Verify link ownership
        let linkOwned = false;
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.id === linkId && rawLink.user_id === userId) {
            linkOwned = true;
            break;
          }
        }
        if (!linkOwned) return [];
        
        for (let i = linkTags.length - 1; i >= 0; i--) {
          const entry = linkTags[i];
          if (entry && entry.link_id === linkId && entry.tag_id === tagId) {
            linkTags.splice(i, 1);
            return [{ link_id: linkId }] as T[];
          }
        }
        return [];
      }
      
      // ---- Webhooks ----

      // SELECT FROM webhooks WHERE user_id = ?
      if (sqlLower.startsWith('select') && sqlLower.includes('from webhooks') && sqlLower.includes('where user_id = ?')) {
        const [userId] = params;
        const webhook = mockWebhooks.get(userId as string);
        return webhook ? [webhook] as T[] : [];
      }

      // SELECT FROM webhooks WHERE token = ?
      if (sqlLower.startsWith('select') && sqlLower.includes('from webhooks') && sqlLower.includes('where token = ?')) {
        const [token] = params;
        for (const webhook of mockWebhooks.values()) {
          const raw = webhook as unknown as Record<string, unknown>;
          if (raw.token === token) {
            return [webhook] as T[];
          }
        }
        return [];
      }

      // DELETE FROM webhooks WHERE user_id = ?
      if (sqlLower.startsWith('delete from webhooks') && sqlLower.includes('where user_id = ?') && !sqlLower.includes('returning')) {
        const [userId] = params;
        mockWebhooks.delete(userId as string);
        return [];
      }

      // DELETE FROM webhooks WHERE user_id = ? RETURNING id
      if (sqlLower.startsWith('delete from webhooks') && sqlLower.includes('where user_id = ?') && sqlLower.includes('returning')) {
        const [userId] = params;
        const webhook = mockWebhooks.get(userId as string);
        if (webhook) {
          mockWebhooks.delete(userId as string);
          const raw = webhook as unknown as Record<string, unknown>;
          return [{ id: raw.id }] as T[];
        }
        return [];
      }

      // INSERT INTO webhooks ... ON CONFLICT(user_id) DO UPDATE (upsert)
      if (sqlLower.startsWith('insert into webhooks')) {
        const [userId, token, createdAt] = params;
        const existing = mockWebhooks.get(userId as string);
        if (existing && sqlLower.includes('on conflict')) {
          // Update existing webhook (upsert)
          const raw = existing as unknown as Record<string, unknown>;
          raw.token = token;
          raw.created_at = createdAt;
          return [raw] as T[];
        }
        const id = getNextWebhookId();
        const webhook = {
          id,
          user_id: userId,
          token,
          rate_limit: 5,
          created_at: createdAt,
        };
        mockWebhooks.set(userId as string, webhook as unknown as import('@/lib/db/schema').Webhook);
        return [webhook] as T[];
      }

      // UPDATE webhooks SET rate_limit = ? WHERE user_id = ?
      if (sqlLower.startsWith('update webhooks') && sqlLower.includes('rate_limit')) {
        const [rateLimit, userId] = params;
        const webhook = mockWebhooks.get(userId as string);
        if (webhook) {
          const raw = webhook as unknown as Record<string, unknown>;
          raw.rate_limit = rateLimit;
          return [raw] as T[];
        }
        return [];
      }

      // ---- User Settings ----

      // SELECT user_id FROM user_settings WHERE backy_pull_key = ? (verify pull webhook)
      if (sqlLower.includes('from user_settings') && sqlLower.includes('where backy_pull_key = ?')) {
        const [pullKey] = params;
        const mockSettings = getMockUserSettings();
        for (const settings of mockSettings.values()) {
          if (settings.backy_pull_key === pullKey) {
            return [{ user_id: settings.user_id }] as T[];
          }
        }
        return [];
      }

      // SELECT FROM user_settings WHERE user_id = ?
      if (sqlLower.includes('from user_settings') && sqlLower.includes('where user_id = ?')) {
        const [userId] = params;
        const mockSettings = getMockUserSettings();
        const settings = mockSettings.get(userId as string);
        return settings ? [settings] as T[] : [];
      }

      // UPDATE user_settings SET backy_pull_key = NULL WHERE user_id = ?
      if (sqlLower.startsWith('update user_settings') && sqlLower.includes('backy_pull_key = null')) {
        const mockSettings = getMockUserSettings();
        // userId is the last param (WHERE user_id = ?)
        const userId = params[params.length - 1] as string;
        const existing = mockSettings.get(userId);
        if (!existing) return [];
        const updated = { ...existing, backy_pull_key: null };
        mockSettings.set(userId, updated);
        return [updated] as T[];
      }

      // INSERT INTO user_settings ... ON CONFLICT ... DO UPDATE (upsert)
      if (sqlLower.startsWith('insert into user_settings')) {
        const mockSettings = getMockUserSettings();
        // Backy pull key upsert: (user_id, preview_style, backy_pull_key)
        // SQL: VALUES (?, 'favicon', ?) — 'favicon' is literal, only 2 bind params: user_id, pull_key
        if (sqlLower.includes('backy_pull_key') && !sqlLower.includes('backy_webhook_url') && !sqlLower.includes('xray_api_url')) {
          const [userId, pullKey] = params;
          const existing = mockSettings.get(userId as string);
          const settings = {
            user_id: userId as string,
            preview_style: existing?.preview_style ?? 'favicon',
            backy_webhook_url: existing?.backy_webhook_url ?? null,
            backy_api_key: existing?.backy_api_key ?? null,
            backy_pull_key: pullKey as string | null,
            xray_api_url: existing?.xray_api_url ?? null,
            xray_api_token: existing?.xray_api_token ?? null,
          };
          mockSettings.set(userId as string, settings);
          return [settings] as T[];
        }
        // Xray settings upsert: (user_id, preview_style, xray_api_url, xray_api_token)
        // SQL: VALUES (?, 'favicon', ?, ?) — 'favicon' is literal, 3 bind params: user_id, apiUrl, apiToken
        if (sqlLower.includes('xray_api_url')) {
          const [userId, apiUrl, apiToken] = params;
          const existing = mockSettings.get(userId as string);
          const settings = {
            user_id: userId as string,
            preview_style: existing?.preview_style ?? 'favicon',
            backy_webhook_url: existing?.backy_webhook_url ?? null,
            backy_api_key: existing?.backy_api_key ?? null,
            backy_pull_key: existing?.backy_pull_key ?? null,
            xray_api_url: apiUrl as string | null,
            xray_api_token: apiToken as string | null,
          };
          mockSettings.set(userId as string, settings);
          return [settings] as T[];
        }
        // Backy settings upsert: (user_id, preview_style, backy_webhook_url, backy_api_key)
        // SQL: VALUES (?, 'favicon', ?, ?) — 'favicon' is literal, 3 bind params: user_id, webhookUrl, apiKey
        if (sqlLower.includes('backy_webhook_url')) {
          const [userId, webhookUrl, apiKey] = params;
          const existing = mockSettings.get(userId as string);
          const settings = {
            user_id: userId as string,
            preview_style: existing?.preview_style ?? 'favicon',
            backy_webhook_url: webhookUrl as string | null,
            backy_api_key: apiKey as string | null,
            backy_pull_key: existing?.backy_pull_key ?? null,
            xray_api_url: existing?.xray_api_url ?? null,
            xray_api_token: existing?.xray_api_token ?? null,
          };
          mockSettings.set(userId as string, settings);
          return [settings] as T[];
        }
        // Preview style upsert: (user_id, preview_style)
        const [userId, previewStyle] = params;
        const existing = mockSettings.get(userId as string);
        const settings = {
          user_id: userId as string,
          preview_style: previewStyle as string,
          backy_webhook_url: existing?.backy_webhook_url ?? null,
          backy_api_key: existing?.backy_api_key ?? null,
          backy_pull_key: existing?.backy_pull_key ?? null,
          xray_api_url: existing?.xray_api_url ?? null,
          xray_api_token: existing?.xray_api_token ?? null,
        };
        mockSettings.set(userId as string, settings);
        return [settings] as T[];
      }

      // ---- Tweet Cache ----

      // SELECT FROM tweet_cache WHERE tweet_id = ?
      if (sqlLower.includes('from tweet_cache') && sqlLower.includes('where tweet_id = ?') && !sqlLower.includes('in (')) {
        const [tweetId] = params;
        const mockCache = getMockTweetCache();
        const cached = mockCache.get(tweetId as string);
        if (cached) {
          return [{
            tweet_id: cached.tweetId,
            author_username: cached.authorUsername,
            author_name: cached.authorName,
            author_avatar: cached.authorAvatar,
            tweet_text: cached.tweetText,
            tweet_url: cached.tweetUrl,
            lang: cached.lang,
            tweet_created_at: cached.tweetCreatedAt,
            raw_data: cached.rawData,
            fetched_at: cached.fetchedAt,
            updated_at: cached.updatedAt,
          }] as T[];
        }
        return [];
      }

      // SELECT FROM tweet_cache WHERE tweet_id IN (...)
      if (sqlLower.includes('from tweet_cache') && sqlLower.includes('in (')) {
        const mockCache = getMockTweetCache();
        const results: unknown[] = [];
        for (const id of params) {
          const cached = mockCache.get(id as string);
          if (cached) {
            results.push({
              tweet_id: cached.tweetId,
              author_username: cached.authorUsername,
              author_name: cached.authorName,
              author_avatar: cached.authorAvatar,
              tweet_text: cached.tweetText,
              tweet_url: cached.tweetUrl,
              lang: cached.lang,
              tweet_created_at: cached.tweetCreatedAt,
              raw_data: cached.rawData,
              fetched_at: cached.fetchedAt,
              updated_at: cached.updatedAt,
            });
          }
        }
        return results as T[];
      }

      // INSERT INTO tweet_cache ... ON CONFLICT ... DO UPDATE (upsert)
      if (sqlLower.startsWith('insert into tweet_cache')) {
        const [tweetId, authorUsername, authorName, authorAvatar, tweetText, tweetUrl, lang, tweetCreatedAt, rawData, fetchedAt, updatedAt] = params;
        const mockCache = getMockTweetCache();
        const existing = mockCache.get(tweetId as string);
        const cached = {
          tweetId: tweetId as string,
          authorUsername: authorUsername as string,
          authorName: authorName as string,
          authorAvatar: authorAvatar as string,
          tweetText: tweetText as string,
          tweetUrl: tweetUrl as string,
          lang: lang as string | null,
          tweetCreatedAt: tweetCreatedAt as string,
          rawData: rawData as string,
          fetchedAt: existing ? existing.fetchedAt : fetchedAt as number,
          updatedAt: updatedAt as number,
        };
        mockCache.set(tweetId as string, cached as unknown as import('@/lib/db/schema').TweetCache);
        return [{
          tweet_id: cached.tweetId,
          author_username: cached.authorUsername,
          author_name: cached.authorName,
          author_avatar: cached.authorAvatar,
          tweet_text: cached.tweetText,
          tweet_url: cached.tweetUrl,
          lang: cached.lang,
          tweet_created_at: cached.tweetCreatedAt,
          raw_data: cached.rawData,
          fetched_at: cached.fetchedAt,
          updated_at: cached.updatedAt,
        }] as T[];
      }

      // ---- API Keys ----

      // SELECT ... FROM api_keys WHERE key_hash = ? (verifyApiKeyAndGetUser)
      if (sqlLower.includes('from api_keys') && sqlLower.includes('where key_hash = ?')) {
        const [keyHash] = params;
        const mockKeys = getMockApiKeys();
        for (const key of mockKeys.values()) {
          if (key.key_hash === keyHash) {
            return [key] as T[];
          }
        }
        return [];
      }

      // SELECT * FROM api_keys WHERE user_id = ? AND revoked_at IS NULL
      if (sqlLower.includes('from api_keys') && sqlLower.includes('where user_id = ?') && sqlLower.includes('revoked_at is null')) {
        const [userId] = params;
        const mockKeys = getMockApiKeys();
        const results: unknown[] = [];
        for (const key of mockKeys.values()) {
          if (key.user_id === userId && key.revoked_at === null) {
            results.push(key);
          }
        }
        // ORDER BY created_at DESC
        results.sort((a, b) => ((b as Record<string, unknown>).created_at as number) - ((a as Record<string, unknown>).created_at as number));
        return results as T[];
      }

      // INSERT INTO api_keys
      if (sqlLower.startsWith('insert into api_keys')) {
        const [id, prefix, keyHash, userId, name, scopes, createdAt] = params;
        const mockKeys = getMockApiKeys();
        const apiKey = {
          id: id as string,
          prefix: prefix as string,
          key_hash: keyHash as string,
          user_id: userId as string,
          name: name as string,
          scopes: scopes as string,
          created_at: createdAt as number,
          last_used_at: null,
          revoked_at: null,
        };
        mockKeys.set(id as string, apiKey);
        return [apiKey] as T[];
      }

      // UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL
      if (sqlLower.includes('update api_keys') && sqlLower.includes('set revoked_at = ?') && sqlLower.includes('where id = ?') && sqlLower.includes('user_id = ?')) {
        const [revokedAt, id, userId] = params;
        const mockKeys = getMockApiKeys();
        const key = mockKeys.get(id as string);
        if (key && key.user_id === userId && key.revoked_at === null) {
          key.revoked_at = revokedAt as number;
          return [key] as T[];
        }
        return [];
      }

      // UPDATE api_keys SET last_used_at = ? WHERE id = ?
      if (sqlLower.includes('update api_keys') && sqlLower.includes('set last_used_at = ?') && sqlLower.includes('where id = ?')) {
        const [lastUsedAt, id] = params;
        const mockKeys = getMockApiKeys();
        const key = mockKeys.get(id as string);
        if (key) {
          key.last_used_at = lastUsedAt as number;
        }
        return [];
      }

      // ---- API Audit Logs ----

      // INSERT INTO api_audit_logs
      if (sqlLower.startsWith('insert into api_audit_logs')) {
        // Fire-and-forget audit logs — just accept the insert
        return [];
      }

      // SELECT * FROM api_audit_logs WHERE key_id = ?
      if (sqlLower.includes('from api_audit_logs') && sqlLower.includes('where key_id = ?')) {
        // For testing, return empty array (no audit logs stored in mock)
        return [];
      }

      // SELECT * FROM api_audit_logs WHERE user_id = ?
      if (sqlLower.includes('from api_audit_logs') && sqlLower.includes('where user_id = ?')) {
        // For testing, return empty array
        return [];
      }

      // ---- Ideas ----

      // INSERT INTO ideas
      if (sqlLower.startsWith('insert into ideas')) {
        const [userId, title, content, excerpt, createdAt, updatedAt] = params;
        const id = getNextIdeaId();
        lastInsertRowId = id;
        const idea = {
          id,
          user_id: userId as string,
          title: title as string | null,
          content: content as string,
          excerpt: excerpt as string | null,
          created_at: createdAt as number,
          updated_at: updatedAt as number,
        };
        const mockIdeas = getMockIdeas();
        mockIdeas.set(id, idea);
        return [idea] as T[];
      }

      // SELECT * FROM ideas WHERE id = ? AND user_id = ? (single idea lookup)
      if (sqlLower.startsWith('select') && sqlLower.includes('from ideas') && sqlLower.includes('where id = ?') && sqlLower.includes('and user_id = ?')) {
        const [id, userId] = params;
        const mockIdeas = getMockIdeas();
        const idea = mockIdeas.get(id as number);
        if (idea && idea.user_id === userId) {
          return [idea] as T[];
        }
        return [];
      }

      // SELECT i.id, i.title, i.excerpt, i.created_at, i.updated_at FROM ideas i ... (list query)
      if (sqlLower.includes('from ideas i') && !sqlLower.includes('where id = ?')) {
        const mockIdeas = getMockIdeas();
        const mockIdeaTags = getMockIdeaTags();
        const results: unknown[] = [];

        // Parse user_id and optional tag filter from params
        const userId = params[0];
        const tagId = sqlLower.includes('it.tag_id = ?') ? params[params.length - 1] : undefined;

        for (const idea of mockIdeas.values()) {
          if (idea.user_id !== userId) continue;

          // Check tag filter if present
          if (tagId) {
            const hasTag = mockIdeaTags.some(it => it.idea_id === idea.id && it.tag_id === tagId);
            if (!hasTag) continue;
          }

          // Check keyword search if present (title or excerpt LIKE %)
          if (sqlLower.includes('i.title like ?')) {
            const searchPattern = params[1] as string;
            const keyword = searchPattern.slice(1, -1); // Remove % wrappers
            const matchesTitle = idea.title?.toLowerCase().includes(keyword.toLowerCase());
            const matchesExcerpt = idea.excerpt?.toLowerCase().includes(keyword.toLowerCase());
            if (!matchesTitle && !matchesExcerpt) continue;
          }

          results.push({
            id: idea.id,
            title: idea.title,
            excerpt: idea.excerpt,
            created_at: idea.created_at,
            updated_at: idea.updated_at,
          });
        }

        // ORDER BY created_at DESC
        results.sort((a, b) => {
          const aTime = (a as Record<string, unknown>).created_at as number;
          const bTime = (b as Record<string, unknown>).created_at as number;
          return bTime - aTime;
        });
        return results as T[];
      }

      // UPDATE ideas SET ... WHERE id = ? AND user_id = ?
      if (sqlLower.startsWith('update ideas set')) {
        const mockIdeas = getMockIdeas();
        const id = params[params.length - 2] as number;
        const userId = params[params.length - 1] as string;

        const idea = mockIdeas.get(id);
        if (!idea || idea.user_id !== userId) return [];

        // Parse SET clause
        const setMatch = sql.match(/set\s+(.+?)\s+where/i);
        if (setMatch && setMatch[1]) {
          const setClauses = setMatch[1].split(',').map(s => s.trim());
          let paramIndex = 0;
          for (const clause of setClauses) {
            const field = (clause.split('=')[0] ?? '').trim();
            if (field === 'updated_at') {
              idea.updated_at = params[paramIndex] as number;
            } else if (field === 'title') {
              idea.title = params[paramIndex] as string | null;
            } else if (field === 'content') {
              idea.content = params[paramIndex] as string;
            } else if (field === 'excerpt') {
              idea.excerpt = params[paramIndex] as string | null;
            }
            paramIndex++;
          }
        }
        return [idea] as T[];
      }

      // DELETE FROM ideas WHERE id = ? AND user_id = ?
      if (sqlLower.startsWith('delete from ideas') && sqlLower.includes('where id = ?')) {
        const [id, userId] = params;
        const mockIdeas = getMockIdeas();
        const idea = mockIdeas.get(id as number);
        if (idea && idea.user_id === userId) {
          mockIdeas.delete(id as number);
          // Cascade delete idea_tags
          const mockIdeaTags = getMockIdeaTags();
          for (let i = mockIdeaTags.length - 1; i >= 0; i--) {
            const entry = mockIdeaTags[i];
            if (entry && entry.idea_id === id) {
              mockIdeaTags.splice(i, 1);
            }
          }
          return [{ id }] as T[];
        }
        return [];
      }

      // ---- Idea-Tags ----

      // INSERT INTO idea_tags (idea_id, tag_id) VALUES (last_insert_rowid(), ?)
      if (sqlLower.startsWith('insert into idea_tags') && sqlLower.includes('last_insert_rowid()')) {
        const [tagId] = params;
        const mockIdeaTags = getMockIdeaTags();
        mockIdeaTags.push({ idea_id: lastInsertRowId, tag_id: tagId as string });
        return [] as T[];
      }

      // INSERT INTO idea_tags (idea_id, tag_id) VALUES (?, ?)
      if (sqlLower.startsWith('insert into idea_tags') && !sqlLower.includes('last_insert_rowid()')) {
        const [ideaId, tagId] = params;
        const mockIdeaTags = getMockIdeaTags();
        mockIdeaTags.push({ idea_id: ideaId as number, tag_id: tagId as string });
        return [] as T[];
      }

      // DELETE FROM idea_tags WHERE idea_id = ?
      if (sqlLower.startsWith('delete from idea_tags') && sqlLower.includes('where idea_id = ?')) {
        const [ideaId] = params;
        const mockIdeaTags = getMockIdeaTags();
        for (let i = mockIdeaTags.length - 1; i >= 0; i--) {
          const entry = mockIdeaTags[i];
          if (entry && entry.idea_id === ideaId) {
            mockIdeaTags.splice(i, 1);
          }
        }
        return [] as T[];
      }

      // SELECT idea_id, tag_id FROM idea_tags WHERE idea_id IN (...)
      if (sqlLower.includes('from idea_tags') && sqlLower.includes('where idea_id in')) {
        const mockIdeaTags = getMockIdeaTags();
        const results: unknown[] = [];
        for (const ideaId of params) {
          for (const entry of mockIdeaTags) {
            if (entry.idea_id === ideaId) {
              results.push(entry);
            }
          }
        }
        return results as T[];
      }

      // SELECT it.* FROM idea_tags it JOIN ideas i ON it.idea_id = i.id WHERE i.user_id = ?
      if (sqlLower.includes('from idea_tags it') && sqlLower.includes('join ideas i')) {
        const [userId] = params;
        const mockIdeas = getMockIdeas();
        const mockIdeaTags = getMockIdeaTags();
        const results: unknown[] = [];
        for (const entry of mockIdeaTags) {
          const idea = mockIdeas.get(entry.idea_id);
          if (idea && idea.user_id === userId) {
            results.push(entry);
          }
        }
        return results as T[];
      }

      // SELECT id FROM tags WHERE user_id = ? AND id IN (...) (pre-validation for createIdea)
      if (sqlLower.includes('from tags') && sqlLower.includes('where user_id = ?') && sqlLower.includes('and id in (')) {
        const [userId, ...tagIds] = params;
        const mockTags = getMockTags();
        const results: { id: string }[] = [];
        for (const tagId of tagIds) {
          for (const tag of mockTags.values()) {
            const raw = tag as unknown as Record<string, unknown>;
            if (raw.id === tagId && raw.user_id === userId) {
              results.push({ id: tagId as string });
            }
          }
        }
        return results as T[];
      }

      console.warn('Unhandled SQL in mock:', sql);
      return [];
    };

  // Batch function: executes multiple statements in sequence, each returning results
  const batchFn = async <T>(statements: Array<{ sql: string; params?: unknown[] }>): Promise<T[][]> => {
    const results: T[][] = [];
    for (const stmt of statements) {
      const result = await queryFn<T>(stmt.sql, stmt.params ?? []);
      results.push(result);
    }
    return results;
  };

  return {
    isD1Configured: () => true,
    executeD1Query: queryFn,
    executeD1Batch: batchFn,
  };
});
