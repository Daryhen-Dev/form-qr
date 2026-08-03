import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestProtected } from '@/lib/operational-api/client'

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringValues)
  if (typeof value !== 'object' || value === null) return []

  return Object.values(value).flatMap(stringValues)
}

// Feature: operational-web-application, Property 2: Custodia del acceso
// **Validates: Requirements 1.4, 7.4, 8.1, 8.2, 8.3**

describe('protected API client access custody', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses every access token only in Authorization and redacts arbitrary failure details', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z0-9._~-]{1,80}$/),
        fc.string({ minLength: 1, maxLength: 160 }),
        async (accessTokenFragment, internalDetailFragment) => {
          const accessToken = `access-token-${accessTokenFragment}`
          const internalDetail = `internal-detail:${internalDetailFragment}`
          const fetchSpy = vi.fn<
            (path: string, init?: RequestInit) => Promise<Response>
          >(async () =>
            new Response(
              JSON.stringify({
                error: internalDetail,
                authorization: `Bearer ${accessToken}`,
                stack: internalDetail,
              }),
              {
                status: 403,
                headers: { 'content-type': 'application/json' },
              }
            )
          )
          vi.stubGlobal('fetch', fetchSpy)

          const result = await requestProtected<unknown>({
            accessToken,
            method: 'GET',
            path: '/users',
          })

          const defaultFetchCall: [path: string, init?: RequestInit] = ['', undefined]
          const fetchCall = fetchSpy.mock.calls[0] ?? defaultFetchCall
          const [requestedPath, requestInit] = fetchCall
          const authorization = new Headers(requestInit?.headers).get('authorization')
          const projectedValues = stringValues(result)

          expect(fetchSpy).toHaveBeenCalledOnce()
          expect(requestedPath).toBe('/api/v1/users')
          expect(authorization).toBe(`Bearer ${accessToken}`)
          expect(projectedValues.some((value) => value.includes(accessToken))).toBe(
            false
          )
          expect(
            projectedValues.some((value) => value.includes(internalDetail))
          ).toBe(false)
          expect(Object.keys(result)).not.toContain('authorization')
          expect(Object.keys(result)).not.toContain('stack')
        }
      ),
      { numRuns: 100 }
    )
  })
})