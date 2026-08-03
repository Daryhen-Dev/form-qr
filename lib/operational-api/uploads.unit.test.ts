import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isProtectedSuccess,
  PROTECTED_RESULT_KIND,
} from '@/lib/operational-api/contracts'
import {
  putPresignedFile,
  requestPresign,
  uploadResponseFile,
} from '@/lib/operational-api/uploads'

const ACCESS_TOKEN = 'access-token-secret-123'
const UPLOAD_URL = 'https://storage.example.com/bucket/obj?sig=signed-query'
const OBJECT_KEY = 'uploads/questionnaire-1/question-1/file.png'

type UploadFetch = (url: string, init?: RequestInit) => Promise<Response>

const DEFAULT_FETCH_CALL: Parameters<UploadFetch> = ['', undefined]

const PRESIGN_REQUEST = {
  questionnaireId: 'questionnaire-1',
  questionId: 'question-1',
  mimeType: 'image/png',
  sizeBytes: 1024,
} as const

function presignResponse(): Response {
  return new Response(
    JSON.stringify({ uploadUrl: UPLOAD_URL, objectKey: OBJECT_KEY }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploads presign client', () => {
  it('requests presign as a protected /api/v1 call with Authorization', async () => {
    const fetchSpy = vi.fn<UploadFetch>(async () => presignResponse())
    vi.stubGlobal('fetch', fetchSpy)

    const result = await requestPresign(ACCESS_TOKEN, PRESIGN_REQUEST)

    const [path, init] = fetchSpy.mock.calls[0] ?? DEFAULT_FETCH_CALL
    expect(path).toBe('/api/v1/uploads/presign')
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${ACCESS_TOKEN}`
    )
    expect(isProtectedSuccess(result)).toBe(true)
    if (isProtectedSuccess(result)) {
      expect(result.data).toEqual({
        uploadUrl: UPLOAD_URL,
        objectKey: OBJECT_KEY,
      })
    }
  })

  it('retries when the presign body has an unexpected shape', async () => {
    const fetchSpy = vi.fn<UploadFetch>(
      async () =>
        new Response(JSON.stringify({ uploadUrl: UPLOAD_URL }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await requestPresign(ACCESS_TOKEN, PRESIGN_REQUEST)

    expect(result.kind).toBe(PROTECTED_RESULT_KIND.RETRYABLE)
  })
})

describe('putPresignedFile', () => {
  it('PUTs to the presigned URL WITHOUT any Authorization / Bearer header', async () => {
    const fetchSpy = vi.fn<UploadFetch>(
      async () => new Response(null, { status: 200 })
    )
    vi.stubGlobal('fetch', fetchSpy)

    const ok = await putPresignedFile(
      UPLOAD_URL,
      new Blob(['data'], { type: 'image/png' }),
      'image/png'
    )

    expect(ok).toBe(true)
    const [url, init] = fetchSpy.mock.calls[0] ?? DEFAULT_FETCH_CALL
    expect(url).toBe(UPLOAD_URL)
    expect(init?.method).toBe('PUT')

    const headers = new Headers(init?.headers)
    expect(headers.has('authorization')).toBe(false)
    expect(headers.get('content-type')).toBe('image/png')
    // No header carries the access token in any form.
    headers.forEach((value) => {
      expect(value.toLowerCase()).not.toContain('bearer')
      expect(value).not.toContain(ACCESS_TOKEN)
    })
  })

  it('returns false when the storage rejects the upload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 }))
    )

    const ok = await putPresignedFile(
      UPLOAD_URL,
      new Blob(['data']),
      'image/png'
    )

    expect(ok).toBe(false)
  })
})

describe('uploadResponseFile', () => {
  it('stores ONLY the objectKey as the answer value and never sends the token in the PUT', async () => {
    const fetchSpy = vi
      .fn<UploadFetch>()
      .mockResolvedValueOnce(presignResponse())
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await uploadResponseFile(
      ACCESS_TOKEN,
      PRESIGN_REQUEST,
      new Blob(['data'], { type: 'image/png' })
    )

    expect(isProtectedSuccess(result)).toBe(true)
    if (isProtectedSuccess(result)) {
      // Proof: only the objectKey string reaches the answer value.
      expect(result.data).toBe(OBJECT_KEY)
      expect(result.data).not.toContain(UPLOAD_URL)
    }

    // Second call is the presigned PUT — must not carry the access token.
    const [putUrl, putInit] = fetchSpy.mock.calls[1] ?? DEFAULT_FETCH_CALL
    expect(putUrl).toBe(UPLOAD_URL)
    expect(putInit?.method).toBe('PUT')
    const putHeaders = new Headers(putInit?.headers)
    expect(putHeaders.has('authorization')).toBe(false)
    putHeaders.forEach((value) => {
      expect(value).not.toContain(ACCESS_TOKEN)
    })
  })

  it('surfaces the presign failure without attempting the upload', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await uploadResponseFile(
      ACCESS_TOKEN,
      PRESIGN_REQUEST,
      new Blob(['data'])
    )

    expect(result.kind).toBe(PROTECTED_RESULT_KIND.UNAUTHENTICATED)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})
