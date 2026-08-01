/**
 * Unit tests for storage.service — Sub-PR 4d.
 * Tests key determinism, URL composition, and adapter factory env switching.
 * No real network I/O — @aws-sdk/client-s3 is mocked.
 *
 * Run with: pnpm vitest run --project unit lib/services/storage.service.unit
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock @aws-sdk/client-s3 before importing storage.service
vi.mock('@aws-sdk/client-s3', () => {
  const mockClientInstance = {
    send: vi.fn(),
  }
  const S3Client = vi.fn().mockImplementation(function () {
    return mockClientInstance
  })
  const PutObjectCommand = vi.fn().mockImplementation(function (input: unknown) {
    return { input }
  })
  return { S3Client, PutObjectCommand }
})

// Mock @aws-sdk/s3-request-presigner
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mocked-presigned-url/key?sig=abc'),
}))

// Mock server-only so it doesn't throw in test environment
vi.mock('server-only', () => ({}))

import { S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Import after mocks are in place
import {
  createStorageService,
  generateUploadKey,
  getObjectUrl,
  expectedKeyPrefix,
} from './storage.service'

const mockS3Client = vi.mocked(S3Client)
const mockGetSignedUrl = vi.mocked(getSignedUrl)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

const validMinioEnv = {
  STORAGE_PROVIDER: 'minio',
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_REGION: 'us-east-1',
  STORAGE_BUCKET: 'form-qr',
  STORAGE_ACCESS_KEY: 'minioadmin',
  STORAGE_SECRET_KEY: 'minioadmin',
  STORAGE_PUBLIC_URL: 'http://localhost:9000/form-qr',
}

// ---------------------------------------------------------------------------
// generateUploadKey — pure function, no SDK involvement
// ---------------------------------------------------------------------------

describe('generateUploadKey', () => {
  it('returns a non-empty string', () => {
    const key = generateUploadKey('t1', 'v1', 'q1')
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })

  it('includes templateId, versionId, and questionId in the path', () => {
    const key = generateUploadKey('templateABC', 'versionXYZ', 'questionDEF')
    expect(key).toContain('templateABC')
    expect(key).toContain('versionXYZ')
    expect(key).toContain('questionDEF')
  })

  it('starts with the expected prefix pattern', () => {
    const key = generateUploadKey('t1', 'v1', 'q1')
    expect(key).toMatch(/^questionnaires\/t1\/versions\/v1\/questions\/q1\//)
  })

  it('different questionIds produce different keys', () => {
    const key1 = generateUploadKey('t1', 'v1', 'q1')
    const key2 = generateUploadKey('t1', 'v1', 'q2')
    expect(key1).not.toBe(key2)
  })

  it('same inputs produce a stable prefix (only the trailing uuid changes between calls)', () => {
    const key1 = generateUploadKey('t1', 'v1', 'q1')
    const key2 = generateUploadKey('t1', 'v1', 'q1')
    // Prefix up to the last segment must be the same
    const prefixOf = (k: string) => k.split('/').slice(0, 6).join('/')
    expect(prefixOf(key1)).toBe(prefixOf(key2))
    // Full keys differ because each call appends a unique uuid
    expect(key1).not.toBe(key2)
  })

  it('performs no network I/O — S3Client constructor not called', () => {
    mockS3Client.mockClear()
    generateUploadKey('t1', 'v1', 'q1')
    expect(mockS3Client).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getObjectUrl — pure function
// ---------------------------------------------------------------------------

describe('getObjectUrl', () => {
  it('composes PUBLIC_URL + key into a URL string', () => {
    const publicUrl = 'http://localhost:9000/form-qr'
    const url = getObjectUrl(publicUrl, 'questionnaires/t1/versions/v1/questions/q1/cuid123')
    expect(url).toBe('http://localhost:9000/form-qr/questionnaires/t1/versions/v1/questions/q1/cuid123')
  })

  it('handles public URL that already ends with slash', () => {
    const url = getObjectUrl('http://localhost:9000/form-qr/', 'some/key')
    expect(url).toBe('http://localhost:9000/form-qr/some/key')
  })

  it('handles public URL without trailing slash', () => {
    const url = getObjectUrl('http://localhost:9000/form-qr', 'some/key')
    expect(url).toBe('http://localhost:9000/form-qr/some/key')
  })
})

// ---------------------------------------------------------------------------
// createStorageService — factory and adapter selection
// ---------------------------------------------------------------------------

describe('createStorageService — factory', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
    vi.clearAllMocks()
  })

  describe('adapter selection', () => {
    it('returns a service when STORAGE_PROVIDER=minio', () => {
      setEnv(validMinioEnv)
      const service = createStorageService()
      expect(service).toBeDefined()
      expect(typeof service.generateUploadKey).toBe('function')
      expect(typeof service.getObjectUrl).toBe('function')
      expect(typeof service.presignPutUrl).toBe('function')
    })

    it('returns a service when STORAGE_PROVIDER=s3', () => {
      setEnv({ ...validMinioEnv, STORAGE_PROVIDER: 's3', STORAGE_ENDPOINT: undefined })
      const service = createStorageService()
      expect(service).toBeDefined()
    })

    it('returns a service when STORAGE_PROVIDER=r2', () => {
      setEnv({ ...validMinioEnv, STORAGE_PROVIDER: 'r2' })
      const service = createStorageService()
      expect(service).toBeDefined()
    })

    it('throws a clear error for unknown STORAGE_PROVIDER', () => {
      setEnv({ ...validMinioEnv, STORAGE_PROVIDER: 'gcs' })
      expect(() => createStorageService()).toThrow(/STORAGE_PROVIDER/)
    })

    it('throws when STORAGE_PROVIDER is missing', () => {
      setEnv({ ...validMinioEnv, STORAGE_PROVIDER: undefined })
      expect(() => createStorageService()).toThrow()
    })
  })

  describe('missing required env vars', () => {
    it('throws when STORAGE_BUCKET is missing', () => {
      setEnv({ ...validMinioEnv, STORAGE_BUCKET: undefined })
      expect(() => createStorageService()).toThrow(/STORAGE_BUCKET/)
    })

    it('throws when STORAGE_ACCESS_KEY is missing', () => {
      setEnv({ ...validMinioEnv, STORAGE_ACCESS_KEY: undefined })
      expect(() => createStorageService()).toThrow(/STORAGE_ACCESS_KEY/)
    })

    it('throws when STORAGE_SECRET_KEY is missing', () => {
      setEnv({ ...validMinioEnv, STORAGE_SECRET_KEY: undefined })
      expect(() => createStorageService()).toThrow(/STORAGE_SECRET_KEY/)
    })

    it('throws when STORAGE_PUBLIC_URL is missing', () => {
      setEnv({ ...validMinioEnv, STORAGE_PUBLIC_URL: undefined })
      expect(() => createStorageService()).toThrow(/STORAGE_PUBLIC_URL/)
    })

    it('throws when STORAGE_ENDPOINT is missing for minio', () => {
      setEnv({ ...validMinioEnv, STORAGE_ENDPOINT: undefined })
      expect(() => createStorageService()).toThrow(/STORAGE_ENDPOINT/)
    })

    it('throws when STORAGE_ENDPOINT is missing for r2', () => {
      setEnv({ ...validMinioEnv, STORAGE_PROVIDER: 'r2', STORAGE_ENDPOINT: undefined })
      expect(() => createStorageService()).toThrow(/STORAGE_ENDPOINT/)
    })
  })

  describe('service interface', () => {
    beforeEach(() => {
      setEnv(validMinioEnv)
    })

    it('generateUploadKey returns a string containing templateId, versionId, questionId', () => {
      const service = createStorageService()
      const key = service.generateUploadKey('tmpl1', 'ver1', 'q1')
      expect(key).toContain('tmpl1')
      expect(key).toContain('ver1')
      expect(key).toContain('q1')
    })

    it('getObjectUrl returns a URL combining PUBLIC_URL and key', () => {
      const service = createStorageService()
      const key = 'questionnaires/t1/versions/v1/questions/q1/cuid'
      const url = service.getObjectUrl(key)
      expect(url).toContain('http://localhost:9000/form-qr')
      expect(url).toContain(key)
    })

    it('presignPutUrl returns a string containing the key (mocked)', async () => {
      const service = createStorageService()
      const key = 'questionnaires/t1/versions/v1/questions/q1/cuid'
      mockGetSignedUrl.mockResolvedValueOnce(`https://presigned.example.com/${key}?sig=xyz`)
      const url = await service.presignPutUrl(key)
      expect(typeof url).toBe('string')
      expect(url).toContain(key)
    })

    it('presignPutUrl calls getSignedUrl (not direct network)', async () => {
      const service = createStorageService()
      mockGetSignedUrl.mockResolvedValueOnce('https://presigned.example.com/key?sig=xyz')
      await service.presignPutUrl('some/key')
      expect(mockGetSignedUrl).toHaveBeenCalledOnce()
    })
  })
})


// ---------------------------------------------------------------------------
// generateUploadKey — owner segment (Sub-PR 5d)
// ---------------------------------------------------------------------------

describe('generateUploadKey — owner segment (5d)', () => {
  it('with ownerId includes the owner segment in the path', () => {
    const key = generateUploadKey('t1', 'v1', 'q1', 'owner_01')
    expect(key).toContain('owner_01')
    expect(key).toMatch(
      /^questionnaires\/t1\/versions\/v1\/questions\/q1\/owner_01\//
    )
  })

  it('without ownerId is backward-compatible (no owner segment)', () => {
    const key = generateUploadKey('t1', 'v1', 'q1')
    expect(key).toMatch(/^questionnaires\/t1\/versions\/v1\/questions\/q1\//)
    expect(key).not.toContain('owner_01')
    // The last path segment is just the uuid (no intermediate owner segment)
    const segments = key.split('/')
    expect(segments).toHaveLength(7) // questionnaires/t1/versions/v1/questions/q1/uuid
  })

  it('with ownerId has 8 path segments', () => {
    const key = generateUploadKey('t1', 'v1', 'q1', 'owner_01')
    const segments = key.split('/')
    expect(segments).toHaveLength(8) // questionnaires/t1/versions/v1/questions/q1/owner_01/uuid
  })

  it('different ownerIds produce different prefixes', () => {
    const key1 = generateUploadKey('t1', 'v1', 'q1', 'owner_A')
    const key2 = generateUploadKey('t1', 'v1', 'q1', 'owner_B')
    const prefix1 = key1.split('/').slice(0, 7).join('/')
    const prefix2 = key2.split('/').slice(0, 7).join('/')
    expect(prefix1).not.toBe(prefix2)
  })
})

// ---------------------------------------------------------------------------
// expectedKeyPrefix — deterministic prefix helper (Sub-PR 5d)
// ---------------------------------------------------------------------------

describe('expectedKeyPrefix', () => {
  it('returns the deterministic prefix ending with /', () => {
    const prefix = expectedKeyPrefix('t1', 'v1', 'q1', 'owner_01')
    expect(prefix).toBe('questionnaires/t1/versions/v1/questions/q1/owner_01/')
  })

  it('a key generated with ownerId starts with the expected prefix', () => {
    const key = generateUploadKey('t1', 'v1', 'q1', 'owner_01')
    const prefix = expectedKeyPrefix('t1', 'v1', 'q1', 'owner_01')
    expect(key.startsWith(prefix)).toBe(true)
  })

  it('a key generated for a different owner does NOT start with another owner prefix', () => {
    const key = generateUploadKey('t1', 'v1', 'q1', 'owner_A')
    const prefixB = expectedKeyPrefix('t1', 'v1', 'q1', 'owner_B')
    expect(key.startsWith(prefixB)).toBe(false)
  })

  it('a key generated without ownerId does NOT start with an owner prefix', () => {
    const key = generateUploadKey('t1', 'v1', 'q1')
    const prefix = expectedKeyPrefix('t1', 'v1', 'q1', 'owner_01')
    expect(key.startsWith(prefix)).toBe(false)
  })
})
