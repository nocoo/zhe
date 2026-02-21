import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so mock fns are available inside vi.mock factories
const { mockSend, mockS3Client, mockPutObjectCommand, mockDeleteObjectCommand, mockGetSignedUrl } = vi.hoisted(() => {
  const mockSend = vi.fn().mockResolvedValue({});
  return {
    mockSend,
    mockS3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    mockPutObjectCommand: vi.fn(),
    mockDeleteObjectCommand: vi.fn(),
    mockGetSignedUrl: vi.fn().mockResolvedValue('https://presigned.example.com/upload'),
  };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: mockS3Client,
  PutObjectCommand: mockPutObjectCommand,
  DeleteObjectCommand: mockDeleteObjectCommand,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

import {
  createPresignedUploadUrl,
  uploadBufferToR2,
  deleteR2Object,
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
