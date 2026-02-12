/**
 * E2E Upload Tests
 *
 * Tests the full upload flow through server actions with the in-memory D1 mock.
 * R2 operations are mocked since they require external infrastructure.
 * Validates the complete lifecycle: presign → record → list → delete
 * from the perspective of an authenticated user (BDD style).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearMockStorage } from '../setup';

// ---------------------------------------------------------------------------
// Mocks — auth and R2 (D1 uses the global mock from setup.ts)
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockCreatePresignedUploadUrl = vi.fn();
const mockDeleteR2Object = vi.fn();
vi.mock('@/lib/r2/client', () => ({
  createPresignedUploadUrl: (...args: unknown[]) => mockCreatePresignedUploadUrl(...args),
  deleteR2Object: (...args: unknown[]) => mockDeleteR2Object(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-upload-e2e';
const OTHER_USER_ID = 'user-other-e2e';

function authenticatedAs(userId: string) {
  mockAuth.mockResolvedValue({
    user: { id: userId, name: 'E2E User', email: 'e2e@test.com' },
  });
}

function unauthenticated() {
  mockAuth.mockResolvedValue(null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Upload E2E — full lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
    process.env.R2_PUBLIC_DOMAIN = 'https://s.zhe.to';
    process.env.R2_USER_HASH_SALT = 'e2e-test-salt';
    mockCreatePresignedUploadUrl.mockResolvedValue('https://r2.example.com/presigned-put');
    mockDeleteR2Object.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.R2_PUBLIC_DOMAIN;
    delete process.env.R2_USER_HASH_SALT;
  });

  // ============================================================
  // Scenario 1: Unauthenticated access denied
  // ============================================================
  describe('unauthenticated user', () => {
    it('cannot get presigned URL', async () => {
      unauthenticated();
      const { getPresignedUploadUrl } = await import('@/actions/upload');

      const result = await getPresignedUploadUrl({
        fileName: 'photo.png',
        fileType: 'image/png',
        fileSize: 1024,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot list uploads', async () => {
      unauthenticated();
      const { getUploads } = await import('@/actions/upload');

      const result = await getUploads();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot delete uploads', async () => {
      unauthenticated();
      const { deleteUpload } = await import('@/actions/upload');

      const result = await deleteUpload(1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  // ============================================================
  // Scenario 2: Full upload lifecycle
  // As an authenticated user, I want to:
  // 1. Get a presigned URL
  // 2. Record the upload after R2 PUT succeeds
  // 3. See the upload in my list
  // 4. Delete the upload (removes from R2 and D1)
  // ============================================================
  describe('authenticated user — complete lifecycle', () => {
    it('presign → record → list → delete', async () => {
      authenticatedAs(USER_ID);
      const {
        getPresignedUploadUrl,
        recordUpload,
        getUploads,
        deleteUpload,
      } = await import('@/actions/upload');

      // Step 1: Get presigned URL
      const presignResult = await getPresignedUploadUrl({
        fileName: 'landscape.png',
        fileType: 'image/png',
        fileSize: 2048,
      });

      expect(presignResult.success).toBe(true);
      expect(presignResult.data).toBeDefined();
      expect(presignResult.data!.uploadUrl).toBe('https://r2.example.com/presigned-put');
      expect(presignResult.data!.publicUrl).toContain('https://s.zhe.to/');
      expect(presignResult.data!.key).toMatch(/^[0-9a-f]{12}\/\d{8}\//);

      const { publicUrl, key } = presignResult.data!;

      // Step 2: Record the upload in D1 (after successful R2 PUT)
      const recordResult = await recordUpload({
        key,
        fileName: 'landscape.png',
        fileType: 'image/png',
        fileSize: 2048,
        publicUrl,
      });

      expect(recordResult.success).toBe(true);
      expect(recordResult.data).toBeDefined();
      expect(recordResult.data!.fileName).toBe('landscape.png');
      expect(recordResult.data!.publicUrl).toBe(publicUrl);
      const uploadId = recordResult.data!.id;

      // Step 3: List uploads — should contain the new upload
      const listResult = await getUploads();

      expect(listResult.success).toBe(true);
      expect(listResult.data).toHaveLength(1);
      expect(listResult.data![0].id).toBe(uploadId);
      expect(listResult.data![0].fileName).toBe('landscape.png');

      // Step 4: Delete the upload
      const deleteResult = await deleteUpload(uploadId);

      expect(deleteResult.success).toBe(true);
      expect(mockDeleteR2Object).toHaveBeenCalledWith(key);

      // Step 5: Verify upload is gone
      const listAfterDelete = await getUploads();

      expect(listAfterDelete.success).toBe(true);
      expect(listAfterDelete.data).toHaveLength(0);
    });
  });

  // ============================================================
  // Scenario 3: Multi-user isolation
  // Uploads from user A should not be visible to user B.
  // ============================================================
  describe('multi-user isolation', () => {
    it('user A cannot see or delete user B uploads', async () => {
      const {
        recordUpload,
        getUploads,
        deleteUpload,
      } = await import('@/actions/upload');

      // User A creates an upload
      authenticatedAs(USER_ID);
      const recordA = await recordUpload({
        key: '20260212/user-a-file.png',
        fileName: 'user-a.png',
        fileType: 'image/png',
        fileSize: 512,
        publicUrl: 'https://s.zhe.to/20260212/user-a-file.png',
      });
      expect(recordA.success).toBe(true);
      const uploadAId = recordA.data!.id;

      // User B creates an upload
      authenticatedAs(OTHER_USER_ID);
      const recordB = await recordUpload({
        key: '20260212/user-b-file.pdf',
        fileName: 'user-b.pdf',
        fileType: 'application/pdf',
        fileSize: 4096,
        publicUrl: 'https://s.zhe.to/20260212/user-b-file.pdf',
      });
      expect(recordB.success).toBe(true);

      // User B lists — should only see their own
      const listB = await getUploads();
      expect(listB.data).toHaveLength(1);
      expect(listB.data![0].fileName).toBe('user-b.pdf');

      // User B tries to delete User A's upload — should fail
      const deleteAttempt = await deleteUpload(uploadAId);
      expect(deleteAttempt.success).toBe(false);
      expect(deleteAttempt.error).toBe('Upload not found or access denied');
      expect(mockDeleteR2Object).not.toHaveBeenCalled();

      // Switch to User A — their upload should still exist
      authenticatedAs(USER_ID);
      const listA = await getUploads();
      expect(listA.data).toHaveLength(1);
      expect(listA.data![0].fileName).toBe('user-a.png');
    });
  });

  // ============================================================
  // Scenario 4: Validation enforcement
  // Server actions should reject invalid file types/sizes.
  // ============================================================
  describe('validation enforcement', () => {
    it('rejects unsupported file type', async () => {
      authenticatedAs(USER_ID);
      const { getPresignedUploadUrl } = await import('@/actions/upload');

      const result = await getPresignedUploadUrl({
        fileName: 'virus.exe',
        fileType: 'application/x-msdownload',
        fileSize: 1024,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
      expect(mockCreatePresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('rejects files exceeding size limit', async () => {
      authenticatedAs(USER_ID);
      const { getPresignedUploadUrl } = await import('@/actions/upload');

      const result = await getPresignedUploadUrl({
        fileName: 'huge.png',
        fileType: 'image/png',
        fileSize: 11 * 1024 * 1024, // 11MB
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds');
      expect(mockCreatePresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('rejects zero-size files', async () => {
      authenticatedAs(USER_ID);
      const { getPresignedUploadUrl } = await import('@/actions/upload');

      const result = await getPresignedUploadUrl({
        fileName: 'empty.png',
        fileType: 'image/png',
        fileSize: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });
  });

  // ============================================================
  // Scenario 5: Multiple uploads ordering
  // Uploads should be returned newest-first.
  // ============================================================
  describe('upload ordering', () => {
    it('returns uploads in reverse chronological order', async () => {
      authenticatedAs(USER_ID);
      const { recordUpload, getUploads } = await import('@/actions/upload');

      // Create 3 uploads
      const files = ['first.png', 'second.png', 'third.png'];
      for (const fileName of files) {
        await recordUpload({
          key: `20260212/${fileName}`,
          fileName,
          fileType: 'image/png',
          fileSize: 1024,
          publicUrl: `https://s.zhe.to/20260212/${fileName}`,
        });
      }

      const listResult = await getUploads();
      expect(listResult.data).toHaveLength(3);

      // Should be in reverse order (newest first)
      const fileNames = listResult.data!.map((u) => u.fileName);
      expect(fileNames).toEqual(['third.png', 'second.png', 'first.png']);
    });
  });
});
