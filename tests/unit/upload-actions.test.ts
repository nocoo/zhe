import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// R2 client mocks
const mockCreatePresignedUploadUrl = vi.fn();
const mockDeleteR2Object = vi.fn();
vi.mock('@/lib/r2/client', () => ({
  createPresignedUploadUrl: (...args: unknown[]) => mockCreatePresignedUploadUrl(...args),
  deleteR2Object: (...args: unknown[]) => mockDeleteR2Object(...args),
}));

// Upload model mocks
const mockValidateUploadRequest = vi.fn();
const mockGenerateObjectKey = vi.fn();
const mockBuildPublicUrl = vi.fn();
const mockHashUserId = vi.fn();
vi.mock('@/models/upload', () => ({
  validateUploadRequest: (...args: unknown[]) => mockValidateUploadRequest(...args),
  generateObjectKey: (...args: unknown[]) => mockGenerateObjectKey(...args),
  buildPublicUrl: (...args: unknown[]) => mockBuildPublicUrl(...args),
  hashUserId: (...args: unknown[]) => mockHashUserId(...args),
}));

// ScopedDB mock instance methods
const mockGetUploads = vi.fn();
const mockCreateUpload = vi.fn();
const mockDeleteUpload = vi.fn();
const mockGetUploadKey = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getUploads: mockGetUploads,
    createUpload: mockCreateUpload,
    deleteUpload: mockDeleteUpload,
    getUploadKey: mockGetUploadKey,
  })),
}));

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  getPresignedUploadUrl,
  recordUpload,
  getUploads,
  deleteUpload,
} from '@/actions/upload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER_ID = 'user-upload-123';

function authenticatedSession() {
  return { user: { id: FAKE_USER_ID, name: 'Test', email: 'test@test.com' } };
}

const FAKE_UPLOAD = {
  id: 1,
  userId: FAKE_USER_ID,
  key: '20260212/abc-def.png',
  fileName: 'photo.png',
  fileType: 'image/png',
  fileSize: 1024,
  publicUrl: 'https://s.zhe.to/20260212/abc-def.png',
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('actions/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: env vars are set
    process.env.R2_PUBLIC_DOMAIN = 'https://s.zhe.to';
    process.env.R2_USER_HASH_SALT = 'test-salt';
    mockHashUserId.mockResolvedValue('abc123def456');
  });

  // ====================================================================
  // getPresignedUploadUrl
  // ====================================================================
  describe('getPresignedUploadUrl', () => {
    const validRequest = {
      fileName: 'photo.png',
      fileType: 'image/png',
      fileSize: 1024,
    };

    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await getPresignedUploadUrl(validRequest);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns Unauthorized when session has no user', async () => {
      mockAuth.mockResolvedValue({ user: undefined });

      const result = await getPresignedUploadUrl(validRequest);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns validation error when request is invalid', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockValidateUploadRequest.mockReturnValue({
        valid: false,
        error: 'File type not allowed',
      });

      const result = await getPresignedUploadUrl(validRequest);

      expect(result).toEqual({ success: false, error: 'File type not allowed' });
      expect(mockCreatePresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('returns error when R2_USER_HASH_SALT is not configured', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockValidateUploadRequest.mockReturnValue({ valid: true });
      delete process.env.R2_USER_HASH_SALT;

      const result = await getPresignedUploadUrl(validRequest);

      expect(result).toEqual({
        success: false,
        error: 'R2 user hash salt not configured',
      });
    });

    it('returns error when R2_PUBLIC_DOMAIN is not configured', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockValidateUploadRequest.mockReturnValue({ valid: true });
      mockGenerateObjectKey.mockReturnValue('abc123def456/20260212/uuid.png');
      delete process.env.R2_PUBLIC_DOMAIN;

      const result = await getPresignedUploadUrl(validRequest);

      expect(result).toEqual({
        success: false,
        error: 'R2 public domain not configured',
      });
    });

    it('returns presigned URL data on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockValidateUploadRequest.mockReturnValue({ valid: true });
      mockGenerateObjectKey.mockReturnValue('abc123def456/20260212/uuid.png');
      mockBuildPublicUrl.mockReturnValue('https://s.zhe.to/abc123def456/20260212/uuid.png');
      mockCreatePresignedUploadUrl.mockResolvedValue('https://r2.example.com/presigned-put');

      const result = await getPresignedUploadUrl(validRequest);

      expect(result).toEqual({
        success: true,
        data: {
          uploadUrl: 'https://r2.example.com/presigned-put',
          publicUrl: 'https://s.zhe.to/abc123def456/20260212/uuid.png',
          key: 'abc123def456/20260212/uuid.png',
        },
      });
      expect(mockHashUserId).toHaveBeenCalledWith(FAKE_USER_ID, 'test-salt');
      expect(mockGenerateObjectKey).toHaveBeenCalledWith('photo.png', 'abc123def456');
      expect(mockBuildPublicUrl).toHaveBeenCalledWith('https://s.zhe.to', 'abc123def456/20260212/uuid.png');
      expect(mockCreatePresignedUploadUrl).toHaveBeenCalledWith('abc123def456/20260212/uuid.png', 'image/png');
    });

    it('returns error when createPresignedUploadUrl throws Error', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockValidateUploadRequest.mockReturnValue({ valid: true });
      mockGenerateObjectKey.mockReturnValue('abc123def456/20260212/uuid.png');
      mockBuildPublicUrl.mockReturnValue('https://s.zhe.to/abc123def456/20260212/uuid.png');
      mockCreatePresignedUploadUrl.mockRejectedValue(new Error('S3 timeout'));

      const result = await getPresignedUploadUrl(validRequest);

      expect(result).toEqual({ success: false, error: 'S3 timeout' });
    });

    it('returns generic error when thrown value is not an Error', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockValidateUploadRequest.mockReturnValue({ valid: true });
      mockGenerateObjectKey.mockReturnValue('abc123def456/20260212/uuid.png');
      mockBuildPublicUrl.mockReturnValue('https://s.zhe.to/abc123def456/20260212/uuid.png');
      mockCreatePresignedUploadUrl.mockRejectedValue('string-error');

      const result = await getPresignedUploadUrl(validRequest);

      expect(result).toEqual({
        success: false,
        error: 'Failed to generate upload URL',
      });
    });
  });

  // ====================================================================
  // recordUpload
  // ====================================================================
  describe('recordUpload', () => {
    const validData = {
      key: '20260212/abc-def.png',
      fileName: 'photo.png',
      fileType: 'image/png',
      fileSize: 1024,
      publicUrl: 'https://s.zhe.to/20260212/abc-def.png',
    };

    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await recordUpload(validData);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('records upload and returns data on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateUpload.mockResolvedValue(FAKE_UPLOAD);

      const result = await recordUpload(validData);

      expect(result).toEqual({ success: true, data: FAKE_UPLOAD });
      expect(mockCreateUpload).toHaveBeenCalledWith({
        key: validData.key,
        fileName: validData.fileName,
        fileType: validData.fileType,
        fileSize: validData.fileSize,
        publicUrl: validData.publicUrl,
      });
    });

    it('returns error when db.createUpload throws Error', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateUpload.mockRejectedValue(new Error('DB write failed'));

      const result = await recordUpload(validData);

      expect(result).toEqual({ success: false, error: 'DB write failed' });
    });

    it('returns generic error when thrown value is not an Error', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateUpload.mockRejectedValue(42);

      const result = await recordUpload(validData);

      expect(result).toEqual({
        success: false,
        error: 'Failed to record upload',
      });
    });
  });

  // ====================================================================
  // getUploads
  // ====================================================================
  describe('getUploads', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await getUploads();

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns uploads on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetUploads.mockResolvedValue([FAKE_UPLOAD]);

      const result = await getUploads();

      expect(result).toEqual({ success: true, data: [FAKE_UPLOAD] });
    });

    it('returns empty array when user has no uploads', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetUploads.mockResolvedValue([]);

      const result = await getUploads();

      expect(result).toEqual({ success: true, data: [] });
    });

    it('returns error when db.getUploads throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetUploads.mockRejectedValue(new Error('timeout'));

      const result = await getUploads();

      expect(result).toEqual({ success: false, error: 'Failed to get uploads' });
    });
  });

  // ====================================================================
  // deleteUpload
  // ====================================================================
  describe('deleteUpload', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await deleteUpload(1);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns not found when upload does not exist or access denied', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetUploadKey.mockResolvedValue(null);

      const result = await deleteUpload(9999);

      expect(result).toEqual({
        success: false,
        error: 'Upload not found or access denied',
      });
      expect(mockDeleteR2Object).not.toHaveBeenCalled();
      expect(mockDeleteUpload).not.toHaveBeenCalled();
    });

    it('deletes from D1 first, then R2 on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetUploadKey.mockResolvedValue('20260212/abc-def.png');
      mockDeleteR2Object.mockResolvedValue(undefined);
      mockDeleteUpload.mockResolvedValue(true);

      const result = await deleteUpload(1);

      expect(result).toEqual({ success: true });
      expect(mockGetUploadKey).toHaveBeenCalledWith(1);
      expect(mockDeleteUpload).toHaveBeenCalledWith(1);
      expect(mockDeleteR2Object).toHaveBeenCalledWith('20260212/abc-def.png');
    });

    it('succeeds even when R2 deletion fails (best-effort cleanup)', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetUploadKey.mockResolvedValue('20260212/abc-def.png');
      mockDeleteUpload.mockResolvedValue(true);
      mockDeleteR2Object.mockRejectedValue(new Error('R2 unavailable'));

      const result = await deleteUpload(1);

      // Should still succeed — R2 failure is logged, not propagated
      expect(result).toEqual({ success: true });
      // D1 deletion should have been called (before R2)
      expect(mockDeleteUpload).toHaveBeenCalledWith(1);
    });

    it('returns error when D1 deletion throws Error', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetUploadKey.mockResolvedValue('20260212/abc-def.png');
      mockDeleteR2Object.mockResolvedValue(undefined);
      mockDeleteUpload.mockRejectedValue(new Error('D1 constraint'));

      const result = await deleteUpload(1);

      expect(result).toEqual({ success: false, error: 'D1 constraint' });
    });

    it('succeeds even when R2 deletion throws non-Error value', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetUploadKey.mockResolvedValue('20260212/abc-def.png');
      mockDeleteUpload.mockResolvedValue(true);
      mockDeleteR2Object.mockRejectedValue('string-error');

      const result = await deleteUpload(1);

      expect(result).toEqual({ success: true });
    });
  });
});
