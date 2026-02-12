import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Re-export clearMockStorage for tests
export { clearMockStorage } from './mocks/db-storage';

// Mock the D1 client with in-memory storage
vi.mock('@/lib/db/d1-client', async () => {
  const { getMockLinks, getMockAnalytics, getMockUploads, getNextLinkId, getNextAnalyticsId, getNextUploadId } = await import('./mocks/db-storage');
  
  return {
    isD1Configured: () => true,
    executeD1Query: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const mockLinks = getMockLinks();
      const mockAnalytics = getMockAnalytics();
      const mockUploads = getMockUploads();
      
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
      
      // SELECT FROM links WHERE user_id = ?
      if (sqlLower.includes('from links') && sqlLower.includes('where user_id = ?')) {
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
      
      // SELECT a.* FROM analytics a JOIN links l ON ... WHERE a.link_id = ? AND l.user_id = ?
      // (ScopedDB analytics query with ownership check)
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

      // SELECT FROM analytics WHERE link_id = ? (unscoped — used by old db/index.ts)
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
      
      console.warn('Unhandled SQL in mock:', sql);
      return [];
    },
  };
});
