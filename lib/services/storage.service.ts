import 'server-only'
import crypto from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ---------------------------------------------------------------------------
// StorageService interface
// ---------------------------------------------------------------------------

/**
 * Seam for S3-compatible object storage (MinIO / AWS S3 / Cloudflare R2).
 * The adapter is selected at runtime via STORAGE_PROVIDER env var.
 *
 * NOTE: presignPutUrl is defined here but not yet called by any endpoint.
 * Actual upload flow is wired in Slice 5.
 */
export interface StorageService {
  /**
   * Generates a deterministic upload key for a question's binary attachment.
   * No network I/O — pure string composition with a unique suffix.
   *
   * Pattern: questionnaires/{templateId}/versions/{versionId}/questions/{questionId}/{cuid}
   */
  generateUploadKey(templateId: string, versionId: string, questionId: string): string

  /**
   * Builds a public URL from STORAGE_PUBLIC_URL + key.
   * No network I/O — pure string composition.
   */
  getObjectUrl(key: string): string

  /**
   * Returns a presigned PUT URL for the given key.
   * Uses @aws-sdk/s3-request-presigner under the hood.
   * Defined here; wired to an upload endpoint in Slice 5.
   */
  presignPutUrl(key: string): Promise<string>
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for direct unit-testing)
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic upload key for a question's binary attachment.
 * Pattern: questionnaires/{templateId}/versions/{versionId}/questions/{questionId}/{cuid}
 *
 * The prefix is stable and deterministic (same inputs → same prefix).
 * Each call appends a fresh cuid so the full key is unique per upload.
 */
export function generateUploadKey(
  templateId: string,
  versionId: string,
  questionId: string
): string {
  return `questionnaires/${templateId}/versions/${versionId}/questions/${questionId}/${crypto.randomUUID()}`
}

/**
 * Builds a public object URL from a base public URL and an object key.
 * Normalises trailing slashes so the result is always `<base>/<key>`.
 */
export function getObjectUrl(publicUrl: string, key: string): string {
  const base = publicUrl.endsWith('/') ? publicUrl.slice(0, -1) : publicUrl
  return `${base}/${key}`
}

// ---------------------------------------------------------------------------
// Env validation helpers
// ---------------------------------------------------------------------------

interface RequiredEnv {
  provider: 'minio' | 's3' | 'r2'
  bucket: string
  region: string
  accessKey: string
  secretKey: string
  publicUrl: string
  endpoint?: string
}

function requireEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `[StorageService] Missing required environment variable: ${name}. ` +
        `Set it in .env before using the storage seam.`
    )
  }
  return value
}

function resolveEnv(): RequiredEnv {
  const rawProvider = requireEnvVar('STORAGE_PROVIDER')

  if (rawProvider !== 'minio' && rawProvider !== 's3' && rawProvider !== 'r2') {
    throw new Error(
      `[StorageService] Unknown STORAGE_PROVIDER value: "${rawProvider}". ` +
        `Expected one of: minio, s3, r2.`
    )
  }

  const provider = rawProvider as 'minio' | 's3' | 'r2'
  const bucket = requireEnvVar('STORAGE_BUCKET')
  const region = process.env.STORAGE_REGION ?? 'us-east-1'
  const accessKey = requireEnvVar('STORAGE_ACCESS_KEY')
  const secretKey = requireEnvVar('STORAGE_SECRET_KEY')
  const publicUrl = requireEnvVar('STORAGE_PUBLIC_URL')

  // minio and r2 require an explicit endpoint; s3 uses the default AWS endpoint
  let endpoint: string | undefined
  if (provider === 'minio' || provider === 'r2') {
    endpoint = requireEnvVar('STORAGE_ENDPOINT')
  } else {
    endpoint = process.env.STORAGE_ENDPOINT
  }

  return { provider, bucket, region, accessKey, secretKey, publicUrl, endpoint }
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Concrete adapter backed by @aws-sdk/client-s3.
 * Works with MinIO (forcePathStyle), AWS S3, and Cloudflare R2 via one client.
 */
class S3CompatibleAdapter implements StorageService {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicUrl: string

  constructor(env: RequiredEnv) {
    this.bucket = env.bucket
    this.publicUrl = env.publicUrl

    this.client = new S3Client({
      region: env.region,
      credentials: {
        accessKeyId: env.accessKey,
        secretAccessKey: env.secretKey,
      },
      // forcePathStyle is required for MinIO (and some R2 configurations)
      forcePathStyle: env.provider === 'minio',
      ...(env.endpoint ? { endpoint: env.endpoint } : {}),
    })
  }

  generateUploadKey(templateId: string, versionId: string, questionId: string): string {
    return generateUploadKey(templateId, versionId, questionId)
  }

  getObjectUrl(key: string): string {
    return getObjectUrl(this.publicUrl, key)
  }

  async presignPutUrl(key: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })
    // Default presign expiry: 15 minutes
    return getSignedUrl(this.client, command, { expiresIn: 900 })
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates and returns a StorageService backed by the env-selected adapter.
 *
 * Reads: STORAGE_PROVIDER ('minio' | 's3' | 'r2'), STORAGE_ENDPOINT (required
 * for minio/r2), STORAGE_REGION, STORAGE_BUCKET, STORAGE_ACCESS_KEY,
 * STORAGE_SECRET_KEY, STORAGE_PUBLIC_URL.
 *
 * Throws a descriptive Error if any required env var is missing or
 * STORAGE_PROVIDER is not a recognised value.
 *
 * Usage:
 *   import { createStorageService } from '@/lib/services/storage.service'
 *   const storage = createStorageService()
 *   const key = storage.generateUploadKey(templateId, versionId, questionId)
 */
export function createStorageService(): StorageService {
  const env = resolveEnv()
  return new S3CompatibleAdapter(env)
}
