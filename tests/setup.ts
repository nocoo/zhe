import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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

// Re-export clearMockStorage for tests
export { clearMockStorage } from './mocks/db-storage';

// Mock the D1 client with in-memory storage
vi.mock('@/lib/db/d1-client', async () => {
  const { getMockLinks, getMockAnalytics, getMockUploads, getMockFolders, getMockWebhooks, getMockTags, getMockLinkTags, getMockUserSettings, getNextLinkId, getNextAnalyticsId, getNextUploadId, getNextWebhookId } = await import('./mocks/db-storage');
  
  return {
    isD1Configured: () => true,
    executeD1Query: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
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
        const [userId, folderId, originalUrl, slug, isCustom, expiresAt, clicks, createdAt] = params;
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
          screenshot_url: null,
          note: null,
          created_at: createdAt,
        };
        mockLinks.set(slug as string, link as unknown as import('@/lib/db/schema').Link);
        return [link] as T[];
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

      // SELECT FROM links WHERE user_id = ?
      if (sqlLower.startsWith('select') && sqlLower.includes('from links') && sqlLower.includes('where user_id = ?')) {
        const [userId] = params;
        const results: unknown[] = [];
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId) {
            results.push(link);
          }
        }
        // Sort by created_at DESC
        results.sort((a, b) => {
          const aTime = (a as Record<string, unknown>).created_at as number;
          const bTime = (b as Record<string, unknown>).created_at as number;
          return bTime - aTime;
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
              if (linkTags[i].link_id === id) {
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
            if (setMatch) {
              const setClauses = setMatch[1].split(',').map(s => s.trim());
              let paramIndex = 0;
              for (const clause of setClauses) {
                const field = clause.split('=')[0].trim();
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
        const [linkId, country, city, device, browser, os, referer, createdAt] = params;
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
          created_at: createdAt,
        };
        mockAnalytics.push(record as unknown as import('@/lib/db/schema').Analytics);
        return [record] as T[];
      }
      
      // SELECT date(...) as date, COUNT(*) as clicks FROM analytics a JOIN links ... GROUP BY date (overview click trend)
      if (sqlLower.includes('count(*)') && sqlLower.includes('from analytics') && sqlLower.includes('join links') && sqlLower.includes('group by date') && !sqlLower.includes('a.link_id = ?')) {
        const [userId] = params;
        const userLinkIds = new Set<number>();
        for (const link of mockLinks.values()) {
          const rawLink = link as unknown as Record<string, unknown>;
          if (rawLink.user_id === userId) userLinkIds.add(rawLink.id as number);
        }
        const dateCounts: Record<string, number> = {};
        for (const a of mockAnalytics) {
          const rawA = a as unknown as Record<string, unknown>;
          if (userLinkIds.has(rawA.link_id as number)) {
            const date = new Date(rawA.created_at as number).toISOString().slice(0, 10);
            dateCounts[date] = (dateCounts[date] || 0) + 1;
          }
        }
        return Object.entries(dateCounts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, clicks]) => ({ date, clicks })) as T[];
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
      if (sqlLower.includes('from links') && sqlLower.includes('where id = ?') && sqlLower.includes('and user_id = ?')) {
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

      // SELECT key FROM uploads WHERE id = ? AND user_id = ?
      if (sqlLower.includes('from uploads') && sqlLower.includes('where id = ?') && sqlLower.includes('and user_id = ?')) {
        const [id, userId] = params;
        for (const upload of mockUploads.values()) {
          const raw = upload as unknown as Record<string, unknown>;
          if (raw.id === id && raw.user_id === userId) {
            return [{ key: raw.key }] as T[];
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
            if (setMatch) {
              const setClauses = setMatch[1].split(',').map(s => s.trim());
              let paramIndex = 0;
              for (const clause of setClauses) {
                const field = clause.split('=')[0].trim();
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
      if (sqlLower.startsWith('select') && sqlLower.includes('from tags') && sqlLower.includes('where user_id = ?') && !sqlLower.includes('and id = ?') && !sqlLower.includes('where id = ?')) {
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
            if (setMatch) {
              const setClauses = setMatch[1].split(',').map(s => s.trim());
              let paramIndex = 0;
              for (const clause of setClauses) {
                const field = clause.split('=')[0].trim();
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
              if (linkTags[i].tag_id === id) {
                linkTags.splice(i, 1);
              }
            }
            return [{ id }] as T[];
          }
        }
        return [];
      }

      // ---- Link-Tags ----

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
          if (linkTags[i].link_id === linkId && linkTags[i].tag_id === tagId) {
            linkTags.splice(i, 1);
            return [{ link_id: linkId }] as T[];
          }
        }
        return [];
      }
      
      // ---- Webhooks ----

      // SELECT FROM webhooks WHERE user_id = ?
      if (sqlLower.includes('from webhooks') && sqlLower.includes('where user_id = ?')) {
        const [userId] = params;
        const webhook = mockWebhooks.get(userId as string);
        return webhook ? [webhook] as T[] : [];
      }

      // SELECT FROM webhooks WHERE token = ?
      if (sqlLower.includes('from webhooks') && sqlLower.includes('where token = ?')) {
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

      // SELECT FROM user_settings WHERE user_id = ?
      if (sqlLower.includes('from user_settings') && sqlLower.includes('where user_id = ?')) {
        const [userId] = params;
        const mockSettings = getMockUserSettings();
        const settings = mockSettings.get(userId as string);
        return settings ? [settings] as T[] : [];
      }

      // INSERT INTO user_settings ... ON CONFLICT ... DO UPDATE (upsert)
      if (sqlLower.startsWith('insert into user_settings')) {
        const [userId, previewStyle] = params;
        const mockSettings = getMockUserSettings();
        const settings = { user_id: userId as string, preview_style: previewStyle as string };
        mockSettings.set(userId as string, settings);
        return [settings] as T[];
      }

      console.warn('Unhandled SQL in mock:', sql);
      return [];
    },
  };
});
