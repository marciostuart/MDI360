import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | undefined;

/**
 * Aceita os dois nomes possíveis das variáveis (padrão AWS e o formato curto
 * usado por vários painéis do MinIO), para o deploy não falhar por causa do nome.
 */
function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

const S3 = {
  endpoint: () => env("S3_ENDPOINT", "MINIO_ENDPOINT"),
  accessKey: () => env("S3_ACCESS_KEY_ID", "S3_ACCESS_KEY", "MINIO_ACCESS_KEY"),
  secretKey: () => env("S3_SECRET_ACCESS_KEY", "S3_SECRET_KEY", "MINIO_SECRET_KEY"),
  bucket: () => env("S3_BUCKET", "MINIO_BUCKET"),
  region: () => env("S3_REGION") ?? "us-east-1",
};

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Object storage (MinIO) is not configured");
    this.name = "StorageNotConfiguredError";
  }
}

export function isStorageConfigured(): boolean {
  return Boolean(S3.endpoint() && S3.accessKey() && S3.secretKey() && S3.bucket());
}

/** Names of the variables that did not reach the container (for the dashboard hint). */
export function missingStorageVars(): string[] {
  const missing: string[] = [];
  if (!S3.endpoint()) missing.push("S3_ENDPOINT");
  if (!S3.bucket()) missing.push("S3_BUCKET");
  if (!S3.accessKey()) missing.push("S3_ACCESS_KEY");
  if (!S3.secretKey()) missing.push("S3_SECRET_KEY");
  return missing;
}

/**
 * Real connectivity test: reaches MinIO and confirms the bucket answers.
 * Returns a short human message when it fails, so the panel can show the cause.
 */
export async function checkStorageConnection(): Promise<{ ok: boolean; error?: string }> {
  const missing = missingStorageVars();
  if (missing.length) return { ok: false, error: `Variáveis ausentes: ${missing.join(", ")}` };

  try {
    await getClient().send(new HeadBucketCommand({ Bucket: getBucket() }));
    return { ok: true };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "Erro";
    return { ok: false, error: `${name}: ${raw}`.slice(0, 300) };
  }
}

function getClient(): S3Client {
  if (!isStorageConfigured()) throw new StorageNotConfiguredError();

  if (!client) {
    client = new S3Client({
      region: S3.region(),
      endpoint: S3.endpoint(),
      // MinIO serves buckets as a path segment, not as a subdomain.
      forcePathStyle: true,
      credentials: {
        accessKeyId: S3.accessKey()!,
        secretAccessKey: S3.secretKey()!,
      },
    });
  }

  return client;
}

function getBucket(): string {
  const bucket = S3.bucket();
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