import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so mock fns are available inside vi.mock factories
const { mockSend, mockS3Client, mockPutObjectCommand, mockDeleteObjectCommand, mockListObjectsV2Command, mockDeleteObjectsCommand, mockGetSignedUrl } = vi.hoisted(() => {
  const mockSend = vi.fn().mockResolvedValue({});
  return {
    mockSend,
    mockS3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    mockPutObjectCommand: vi.fn(),
    mockDeleteObjectCommand: vi.fn(),
    mockListObjectsV2Command: vi.fn(),
    mockDeleteObjectsCommand: vi.fn(),
    mockGetSignedUrl: vi.fn().mockResolvedValue('https://presigned.example.com/upload'),
  };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: mockS3Client,
  PutObjectCommand: mockPutObjectCommand,
  DeleteObjectCommand: mockDeleteObjectCommand,
  ListObjectsV2Command: mockListObjectsV2Command,
  DeleteObjectsCommand: mockDeleteObjectsCommand,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

import {
  createPresignedUploadUrl,
  uploadBufferToR2,
  deleteR2Object,
  listR2Objects,
  deleteR2Objects,
  resetR2Client,
} from '@/lib/r2/client';

function setR2Env() {
  process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.R2_ENDPOINT = 'https://r2.example.com';
  process.env.R2_BUCKET_NAME = 'test-bucket';
}

function clearR2Env() {
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_ENDPOINT;
  delete process.env.R2_BUCKET_NAME;
}

describe('R2 Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearR2Env();
    resetR2Client();
  });

  afterEach(() => {
    clearR2Env();
    resetR2Client();
  });

  // ---- getR2Config (tested indirectly) ----

  describe('getR2Config (indirect)', () => {
    it('throws when R2_ACCESS_KEY_ID is missing', async () => {
      process.env.R2_SECRET_ACCESS_KEY = 'key';
      process.env.R2_ENDPOINT = 'https://r2.example.com';
      process.env.R2_BUCKET_NAME = 'bucket';

      await expect(createPresignedUploadUrl('key.png', 'image/png')).rejects.toThrow(
        'Missing R2 configuration',
      );
    });

    it('throws when R2_SECRET_ACCESS_KEY is missing', async () => {
      process.env.R2_ACCESS_KEY_ID = 'key';
      process.env.R2_ENDPOINT = 'https://r2.example.com';
      process.env.R2_BUCKET_NAME = 'bucket';

      await expect(createPresignedUploadUrl('key.png', 'image/png')).rejects.toThrow(
        'Missing R2 configuration',
      );
    });

    it('throws when R2_ENDPOINT is missing', async () => {
      process.env.R2_ACCESS_KEY_ID = 'key';
      process.env.R2_SECRET_ACCESS_KEY = 'secret';
      process.env.R2_BUCKET_NAME = 'bucket';

      await expect(createPresignedUploadUrl('key.png', 'image/png')).rejects.toThrow(
        'Missing R2 configuration',
      );
    });

    it('throws when R2_BUCKET_NAME is missing', async () => {
      process.env.R2_ACCESS_KEY_ID = 'key';
      process.env.R2_SECRET_ACCESS_KEY = 'secret';
      process.env.R2_ENDPOINT = 'https://r2.example.com';

      await expect(createPresignedUploadUrl('key.png', 'image/png')).rejects.toThrow(
        'Missing R2 configuration',
      );
    });

    it('throws when all R2 env vars are missing', async () => {
      await expect(deleteR2Object('key.png')).rejects.toThrow(
        'Missing R2 configuration',
      );
    });
  });

  // ---- getR2Client (tested indirectly via caching) ----

  describe('getR2Client caching (indirect)', () => {
    it('creates S3Client only once across multiple calls', async () => {
      setR2Env();

      await createPresignedUploadUrl('a.png', 'image/png');
      await createPresignedUploadUrl('b.png', 'image/png');

      expect(mockS3Client).toHaveBeenCalledTimes(1);
    });

    it('creates S3Client with correct config', async () => {
      setR2Env();

      await createPresignedUploadUrl('test.png', 'image/png');

      expect(mockS3Client).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: 'https://r2.example.com',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
      });
    });

    it('creates a new S3Client after resetR2Client', async () => {
      setR2Env();

      await createPresignedUploadUrl('a.png', 'image/png');
      expect(mockS3Client).toHaveBeenCalledTimes(1);

      resetR2Client();

      await createPresignedUploadUrl('b.png', 'image/png');
      expect(mockS3Client).toHaveBeenCalledTimes(2);
    });
  });

  // ---- createPresignedUploadUrl ----

  describe('createPresignedUploadUrl', () => {
    it('returns a presigned URL', async () => {
      setR2Env();

      const url = await createPresignedUploadUrl('20260212/uuid.png', 'image/png');

      expect(url).toBe('https://presigned.example.com/upload');
    });

    it('creates PutObjectCommand with correct params', async () => {
      setR2Env();

      await createPresignedUploadUrl('20260212/uuid.png', 'image/png');

      expect(mockPutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: '20260212/uuid.png',
        ContentType: 'image/png',
      });
    });

    it('calls getSignedUrl with expiresIn 300', async () => {
      setR2Env();

      await createPresignedUploadUrl('key.png', 'image/png');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 },
      );
    });
  });

  // ---- uploadBufferToR2 ----

  describe('uploadBufferToR2', () => {
    it('sends PutObjectCommand with body', async () => {
      setR2Env();
      const body = new Uint8Array([1, 2, 3]);

      await uploadBufferToR2('20260212/img.png', body, 'image/png');

      expect(mockPutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: '20260212/img.png',
        Body: body,
        ContentType: 'image/png',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('throws when env vars are missing', async () => {
      const body = new Uint8Array([1, 2, 3]);

      await expect(
        uploadBufferToR2('key.png', body, 'image/png'),
      ).rejects.toThrow('Missing R2 configuration');
    });
  });

  // ---- deleteR2Object ----

  describe('deleteR2Object', () => {
    it('sends DeleteObjectCommand with correct params', async () => {
      setR2Env();

      await deleteR2Object('20260212/delete-me.png');

      expect(mockDeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: '20260212/delete-me.png',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('throws when env vars are missing', async () => {
      await expect(deleteR2Object('key.png')).rejects.toThrow(
        'Missing R2 configuration',
      );
    });
  });

  // ---- listR2Objects ----

  describe('listR2Objects', () => {
    it('returns empty array when no objects exist', async () => {
      setR2Env();
      mockSend.mockResolvedValueOnce({
        Contents: undefined,
        IsTruncated: false,
      });

      const result = await listR2Objects();

      expect(result).toEqual([]);
      expect(mockListObjectsV2Command).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Prefix: undefined,
        MaxKeys: 1000,
        ContinuationToken: undefined,
      });
    });

    it('returns mapped R2Object array', async () => {
      setR2Env();
      const date = new Date('2026-01-15T10:00:00Z');
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'file1.png', Size: 1024, LastModified: date },
          { Key: 'file2.jpg', Size: 2048, LastModified: date },
        ],
        IsTruncated: false,
      });

      const result = await listR2Objects();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        key: 'file1.png',
        size: 1024,
        lastModified: '2026-01-15T10:00:00.000Z',
      });
      expect(result[1]).toEqual({
        key: 'file2.jpg',
        size: 2048,
        lastModified: '2026-01-15T10:00:00.000Z',
      });
    });

    it('passes prefix to ListObjectsV2Command', async () => {
      setR2Env();
      mockSend.mockResolvedValueOnce({
        Contents: [],
        IsTruncated: false,
      });

      await listR2Objects('uploads/');

      expect(mockListObjectsV2Command).toHaveBeenCalledWith(
        expect.objectContaining({ Prefix: 'uploads/' }),
      );
    });

    it('handles pagination with continuation token', async () => {
      setR2Env();
      const date = new Date('2026-01-15T10:00:00Z');

      // First page - truncated
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'file1.png', Size: 100, LastModified: date }],
        IsTruncated: true,
        NextContinuationToken: 'token-page-2',
      });
      // Second page - final
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'file2.png', Size: 200, LastModified: date }],
        IsTruncated: false,
      });

      const result = await listR2Objects();

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('file1.png');
      expect(result[1].key).toBe('file2.png');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('skips objects without Key or Size', async () => {
      setR2Env();
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'valid.png', Size: 100, LastModified: new Date() },
          { Key: undefined, Size: 200, LastModified: new Date() },
          { Key: 'no-size.png', Size: undefined, LastModified: new Date() },
        ],
        IsTruncated: false,
      });

      const result = await listR2Objects();

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('valid.png');
    });

    it('uses empty string for lastModified when LastModified is undefined', async () => {
      setR2Env();
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'no-date.png', Size: 50, LastModified: undefined }],
        IsTruncated: false,
      });

      const result = await listR2Objects();

      expect(result).toHaveLength(1);
      expect(result[0].lastModified).toBe('');
    });

    it('throws when env vars are missing', async () => {
      await expect(listR2Objects()).rejects.toThrow('Missing R2 configuration');
    });
  });

  // ---- deleteR2Objects ----

  describe('deleteR2Objects', () => {
    it('returns 0 for empty keys array', async () => {
      setR2Env();

      const result = await deleteR2Objects([]);

      expect(result).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('deletes a batch of keys', async () => {
      setR2Env();
      mockSend.mockResolvedValueOnce({ Errors: undefined });

      const result = await deleteR2Objects(['file1.png', 'file2.png']);

      expect(result).toBe(2);
      expect(mockDeleteObjectsCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Delete: {
          Objects: [{ Key: 'file1.png' }, { Key: 'file2.png' }],
          Quiet: true,
        },
      });
    });

    it('subtracts errors from deleted count', async () => {
      setR2Env();
      mockSend.mockResolvedValueOnce({
        Errors: [{ Key: 'file2.png', Code: 'NoSuchKey' }],
      });

      const result = await deleteR2Objects(['file1.png', 'file2.png', 'file3.png']);

      // 3 keys - 1 error = 2 deleted
      expect(result).toBe(2);
    });

    it('batches keys in groups of 1000', async () => {
      setR2Env();
      // Create 1500 keys
      const keys = Array.from({ length: 1500 }, (_, i) => `file-${i}.png`);

      // First batch (1000 keys) - no errors
      mockSend.mockResolvedValueOnce({ Errors: undefined });
      // Second batch (500 keys) - no errors
      mockSend.mockResolvedValueOnce({ Errors: undefined });

      const result = await deleteR2Objects(keys);

      expect(result).toBe(1500);
      expect(mockSend).toHaveBeenCalledTimes(2);
      // First batch should have 1000 keys
      expect(mockDeleteObjectsCommand).toHaveBeenNthCalledWith(1, {
        Bucket: 'test-bucket',
        Delete: {
          Objects: keys.slice(0, 1000).map((k) => ({ Key: k })),
          Quiet: true,
        },
      });
      // Second batch should have 500 keys
      expect(mockDeleteObjectsCommand).toHaveBeenNthCalledWith(2, {
        Bucket: 'test-bucket',
        Delete: {
          Objects: keys.slice(1000).map((k) => ({ Key: k })),
          Quiet: true,
        },
      });
    });

    it('throws when env vars are missing', async () => {
      await expect(deleteR2Objects(['key.png'])).rejects.toThrow(
        'Missing R2 configuration',
      );
    });
  });

  // ---- resetR2Client ----

  describe('resetR2Client', () => {
    it('resets the cached client so a new one is created', async () => {
      setR2Env();

      await createPresignedUploadUrl('a.png', 'image/png');
      expect(mockS3Client).toHaveBeenCalledTimes(1);

      resetR2Client();
      await createPresignedUploadUrl('b.png', 'image/png');
      expect(mockS3Client).toHaveBeenCalledTimes(2);
    });

    it('can be called multiple times without error', () => {
      expect(() => {
        resetR2Client();
        resetR2Client();
        resetR2Client();
      }).not.toThrow();
    });
  });
});
