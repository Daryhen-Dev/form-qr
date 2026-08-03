import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isProtectedSuccess,
  PROTECTED_RESULT_KIND,
  type CreateResponseRequest,
  type UpdateResponseRequest,
} from '@/lib/operational-api/contracts'
import { resolveScan } from '@/lib/operational-api/scan'
import { createResponse, updateResponse } from '@/lib/operational-api/responses'

const ACCESS_TOKEN = 'access-token-xyz'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const SCAN_DTO = {
  questionnaireId: 'q-1',
  version: { id: 'v-1', questionnaireId: 'q-1', status: 'published' },
  questions: [{ id: 'question-1', type: 'boolean' }],
  status: 'absent',
  response: null,
}

const RESPONSE_DTO = {
  id: 'response-1',
  questionnaireId: 'q-1',
  versionId: 'v-1',
  businessDay: '2026-01-01',
  status: 'editable',
  answers: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  submittedAt: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveScan', () => {
  it('resolves the encoded QR token and projects the scan envelope', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      jsonResponse({ scan: SCAN_DTO }, 200)
    )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await resolveScan(ACCESS_TOKEN, 'tok en/1')

    const [path, init] = fetchSpy.mock.calls[0] ?? []
    expect(path).toBe('/api/v1/scan/tok%20en%2F1')
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${ACCESS_TOKEN}`
    )
    expect(isProtectedSuccess(result)).toBe(true)
    if (isProtectedSuccess(result)) {
      expect(result.data.status).toBe('absent')
      expect(result.data.questions).toHaveLength(1)
    }
  })

  it('maps 404 to an unavailable result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 404)))

    const result = await resolveScan(ACCESS_TOKEN, 'tok')

    expect(result.kind).toBe(PROTECTED_RESULT_KIND.UNAVAILABLE)
  })
})

describe('createResponse / updateResponse', () => {
  it('POSTs a typed create request and projects the response envelope', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      jsonResponse({ response: RESPONSE_DTO }, 201)
    )
    vi.stubGlobal('fetch', fetchSpy)

    const request: CreateResponseRequest = {
      questionnaireId: 'q-1',
      answers: [{ questionId: 'question-1', type: 'boolean', value: true }],
    }
    const result = await createResponse(ACCESS_TOKEN, request)

    const [path, init] = fetchSpy.mock.calls[0] ?? []
    expect(path).toBe('/api/v1/responses')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(request)
    expect(isProtectedSuccess(result)).toBe(true)
    if (isProtectedSuccess(result)) {
      expect(result.data.id).toBe('response-1')
    }
  })

  it('PATCHes the encoded response id with typed answers', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      jsonResponse({ response: RESPONSE_DTO }, 200)
    )
    vi.stubGlobal('fetch', fetchSpy)

    const request: UpdateResponseRequest = {
      answers: [{ questionId: 'question-1', type: 'short_text', value: 'hi' }],
    }
    const result = await updateResponse(ACCESS_TOKEN, 'response-1', request)

    const [path, init] = fetchSpy.mock.calls[0] ?? []
    expect(path).toBe('/api/v1/responses/response-1')
    expect(init?.method).toBe('PATCH')
    expect(isProtectedSuccess(result)).toBe(true)
  })

  it('maps 409 to a conflict result so the caller can re-resolve the scan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 409)))

    const result = await createResponse(ACCESS_TOKEN, {
      questionnaireId: 'q-1',
      answers: [],
    })

    expect(result.kind).toBe(PROTECTED_RESULT_KIND.CONFLICT)
  })
})
