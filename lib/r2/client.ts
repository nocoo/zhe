/**
 * Cloudflare R2 client — S3-compatible API for presigned URL generation,
 * object listing, and deletion.
 *
 * Environment variables required:
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
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
 * Upload a buffer directly to R2 (server-side).
 * Used for proxying external images (e.g. Microlink screenshots) into R2.
 *
 * @param key         - R2 object key
 * @param body        - File content as Buffer or Uint8Array
 * @param contentType - MIME type of the file
 */
export async function uploadBufferToR2(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
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

/** An object returned from R2 listing. */
export interface R2Object {
  key: string;
  size: number;
  lastModified: string;
}

/**
 * List all objects in R2, optionally filtered by prefix.
 * Handles pagination automatically (1000 objects per page).
 */
export async function listR2Objects(prefix?: string): Promise<R2Object[]> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  const objects: R2Object[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    });

    const response = await client.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.Size !== undefined) {
          objects.push({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified?.toISOString() ?? '',
          });
        }
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

/**
 * Delete multiple objects from R2 in a single request.
 * S3 DeleteObjects supports up to 1000 keys per call; this function
 * auto-batches larger lists.
 *
 * @returns number of objects successfully deleted
 */
export async function deleteR2Objects(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;

  const client = getR2Client();
  const { bucket } = getR2Config();

  let deleted = 0;
  const BATCH_SIZE = 1000;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);

    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
        Quiet: true,
      },
    });

    const response = await client.send(command);
    // Errors array only populated when Quiet=true and individual deletes fail
    const errors = response.Errors?.length ?? 0;
    deleted += batch.length - errors;
  }

  return deleted;
}

/** Reset the cached S3 client (for testing). */
export function resetR2Client(): void {
  _client = null;
}
