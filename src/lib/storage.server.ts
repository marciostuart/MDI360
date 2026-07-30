import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | undefined;

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Object storage (MinIO) is not configured");
    this.name = "StorageNotConfiguredError";
  }
}

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET,
  );
}

function getClient(): S3Client {
  if (!isStorageConfigured()) throw new StorageNotConfiguredError();

  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      // MinIO serves buckets as a path segment, not as a subdomain.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  return client;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new StorageNotConfiguredError();
  return bucket;
}

/** Short-lived URL the browser/player uses to read a private object. */
export function createDownloadUrl(key: string, expiresInSeconds = 3600) {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: getBucket(), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/** Short-lived URL the browser uses to upload directly, bypassing our server. */
export function createUploadUrl(key: string, contentType: string, expiresInSeconds = 900) {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: getBucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}

export async function deleteObject(key: string) {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}