import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  validateUploadRequest,
  extractExtension,
  generateObjectKey,
  buildPublicUrl,
  isImageType,
  formatFileSize,
  hashUserId,
  isPngFile,
  replaceExtension,
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
} from '@/models/upload';
import type { UploadRequest } from '@/models/upload';

describe('models/upload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // --- validateUploadRequest ---
  describe('validateUploadRequest', () => {
    const validRequest: UploadRequest = {
      fileName: 'photo.png',
      fileType: 'image/png',
      fileSize: 1024,
    };

    it('accepts a valid image upload', () => {
      expect(validateUploadRequest(validRequest)).toEqual({ valid: true });
    });

    it('accepts a valid document upload', () => {
      const req: UploadRequest = {
        fileName: 'doc.pdf',
        fileType: 'application/pdf',
        fileSize: 2048,
      };
      expect(validateUploadRequest(req)).toEqual({ valid: true });
    });

    it('accepts all allowed MIME types', () => {
      for (const type of ALLOWED_TYPES) {
        const result = validateUploadRequest({
          fileName: 'test.file',
          fileType: type,
          fileSize: 100,
        });
        expect(result.valid).toBe(true);
      }
    });

    it('rejects missing fileName', () => {
      const result = validateUploadRequest({ ...validRequest, fileName: '' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Missing required fields');
    });

    it('rejects missing fileType', () => {
      const result = validateUploadRequest({ ...validRequest, fileType: '' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Missing required fields');
    });

    it('rejects zero fileSize', () => {
      const result = validateUploadRequest({ ...validRequest, fileSize: 0 });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('Missing required fields');
    });

    it('rejects negative fileSize', () => {
      const result = validateUploadRequest({ ...validRequest, fileSize: -1 });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('greater than 0');
    });

    it('rejects disallowed MIME type', () => {
      const result = validateUploadRequest({
        ...validRequest,
        fileType: 'application/zip',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('not allowed');
    });

    it('rejects file exceeding MAX_FILE_SIZE', () => {
      const result = validateUploadRequest({
        ...validRequest,
        fileSize: MAX_FILE_SIZE + 1,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('10MB');
    });

    it('accepts file at exactly MAX_FILE_SIZE', () => {
      const result = validateUploadRequest({
        ...validRequest,
        fileSize: MAX_FILE_SIZE,
      });
      expect(result).toEqual({ valid: true });
    });
  });

  // --- extractExtension ---
  describe('extractExtension', () => {
    it('extracts simple extension', () => {
      expect(extractExtension('photo.png')).toBe('png');
    });

    it('extracts extension with multiple dots', () => {
      expect(extractExtension('my.file.name.jpg')).toBe('jpg');
    });

    it('lowercases extension', () => {
      expect(extractExtension('Photo.PNG')).toBe('png');
    });

    it('returns empty for no extension', () => {
      expect(extractExtension('noext')).toBe('');
    });

    it('returns empty for trailing dot', () => {
      expect(extractExtension('file.')).toBe('');
    });

    it('handles dotfiles', () => {
      expect(extractExtension('.gitignore')).toBe('gitignore');
    });
  });

  // --- generateObjectKey ---
  describe('generateObjectKey', () => {
    const userHash = 'abc123def456';

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-12T15:30:00Z'));
    });

    it('produces {userHash}/YYYYMMDD/uuid.ext format', () => {
      const key = generateObjectKey('photo.png', userHash);
      expect(key).toMatch(/^abc123def456\/20260212\/[0-9a-f-]{36}\.png$/);
    });

    it('uses UTC date for folder name', () => {
      // 2026-02-12 23:30 UTC → should still be 20260212, not 20260213
      vi.setSystemTime(new Date('2026-02-12T23:30:00Z'));
      const key = generateObjectKey('test.jpg', userHash);
      expect(key).toMatch(/^abc123def456\/20260212\//);
    });

    it('omits extension when filename has none', () => {
      const key = generateObjectKey('noext', userHash);
      expect(key).toMatch(/^abc123def456\/20260212\/[0-9a-f-]{36}$/);
    });

    it('generates unique keys on successive calls', () => {
      const key1 = generateObjectKey('a.png', userHash);
      const key2 = generateObjectKey('a.png', userHash);
      expect(key1).not.toBe(key2);
    });

    it('preserves lowercase extension from original', () => {
      const key = generateObjectKey('PHOTO.WEBP', userHash);
      expect(key).toMatch(/\.webp$/);
    });

    it('zero-pads month and day', () => {
      vi.setSystemTime(new Date('2026-01-05T10:00:00Z'));
      const key = generateObjectKey('file.txt', userHash);
      expect(key).toMatch(/^abc123def456\/20260105\//);
    });

    it('different user hashes produce different prefixes', () => {
      const key1 = generateObjectKey('a.png', 'aaa111bbb222');
      const key2 = generateObjectKey('a.png', 'ccc333ddd444');
      expect(key1.split('/')[0]).toBe('aaa111bbb222');
      expect(key2.split('/')[0]).toBe('ccc333ddd444');
    });
  });

  // --- buildPublicUrl ---
  describe('buildPublicUrl', () => {
    it('joins domain and key', () => {
      expect(buildPublicUrl('https://s.zhe.to', '20260212/abc.png')).toBe(
        'https://s.zhe.to/20260212/abc.png',
      );
    });

    it('strips trailing slash from domain', () => {
      expect(buildPublicUrl('https://s.zhe.to/', '20260212/abc.png')).toBe(
        'https://s.zhe.to/20260212/abc.png',
      );
    });
  });

  // --- isImageType ---
  describe('isImageType', () => {
    it('returns true for image/png', () => {
      expect(isImageType('image/png')).toBe(true);
    });

    it('returns true for image/svg+xml', () => {
      expect(isImageType('image/svg+xml')).toBe(true);
    });

    it('returns false for application/pdf', () => {
      expect(isImageType('application/pdf')).toBe(false);
    });

    it('returns false for text/plain', () => {
      expect(isImageType('text/plain')).toBe(false);
    });

    it('returns false for unknown types', () => {
      expect(isImageType('video/mp4')).toBe(false);
    });
  });

  // --- formatFileSize ---
  describe('formatFileSize', () => {
    it('formats 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('formats bytes', () => {
      expect(formatFileSize(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });

    it('formats gigabytes', () => {
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('formats exact 1 KB', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
    });
  });

  // --- hashUserId ---
  describe('hashUserId', () => {
    it('returns a 12-char hex string', async () => {
      const hash = await hashUserId('user-123', 'test-salt');
      expect(hash).toMatch(/^[0-9a-f]{12}$/);
    });

    it('is deterministic for same inputs', async () => {
      const a = await hashUserId('user-123', 'salt-a');
      const b = await hashUserId('user-123', 'salt-a');
      expect(a).toBe(b);
    });

    it('produces different hashes for different users', async () => {
      const a = await hashUserId('user-aaa', 'salt');
      const b = await hashUserId('user-bbb', 'salt');
      expect(a).not.toBe(b);
    });

    it('produces different hashes for different salts', async () => {
      const a = await hashUserId('user-123', 'salt-1');
      const b = await hashUserId('user-123', 'salt-2');
      expect(a).not.toBe(b);
    });

    it('does not contain the original userId', async () => {
      const hash = await hashUserId('user-123', 'my-salt');
      expect(hash).not.toContain('user-123');
    });
  });

  // --- isPngFile ---
  describe('isPngFile', () => {
    it('returns true for image/png', () => {
      expect(isPngFile({ type: 'image/png' })).toBe(true);
    });

    it('returns false for image/jpeg', () => {
      expect(isPngFile({ type: 'image/jpeg' })).toBe(false);
    });

    it('returns false for image/webp', () => {
      expect(isPngFile({ type: 'image/webp' })).toBe(false);
    });

    it('returns false for empty type', () => {
      expect(isPngFile({ type: '' })).toBe(false);
    });
  });

  // --- replaceExtension ---
  describe('replaceExtension', () => {
    it('replaces .png with .jpg', () => {
      expect(replaceExtension('photo.png', 'jpg')).toBe('photo.jpg');
    });

    it('replaces .PNG with .jpg (case insensitive)', () => {
      expect(replaceExtension('PHOTO.PNG', 'jpg')).toBe('PHOTO.jpg');
    });

    it('replaces last extension only', () => {
      expect(replaceExtension('my.file.name.png', 'jpg')).toBe('my.file.name.jpg');
    });

    it('appends extension when no extension exists', () => {
      expect(replaceExtension('noext', 'jpg')).toBe('noext.jpg');
    });

    it('appends extension when filename ends with dot', () => {
      expect(replaceExtension('file.', 'jpg')).toBe('file.jpg');
    });
  });
});
