/**
 * Cloudflare R2 client — S3-compatible API for presigned URL generation and object deletion.
 *
 * Environment variables required:
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Presigned URL expiration in seconds (5 minutes). */
const PRESIGN_EXPIRES_IN = 300;

function getR2Config() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new Error(
      'Missing R2 configuration. Required: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME',
    );
  }

  return { accessKeyId, secretAccessKey, endpoint, bucket };
}

let _client: S3Client | null = null;

function getR2Client(): S3Client {
  if (_client) return _client;

  const { accessKeyId, secretAccessKey, endpoint } = getR2Config();

  _client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return _client;
}

/**
 * Generate a presigned PUT URL for uploading a file directly to R2.
 *
 * @param key         - R2 object key (e.g. `20260212/uuid.png`)
 * @param contentType - MIME type of the file
 * @returns presigned URL valid for 5 minutes
 */
export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRES_IN });
}

/**
 * Delete an object from R2.
 *
 * @param key - R2 object key to delete
 */
export async function deleteR2Object(key: string): Promise<void> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

/** Reset the cached S3 client (for testing). */
export function resetR2Client(): void {
  _client = null;
}
