import { refreshSchema } from '@/lib/validations/auth.schema'
import { refresh } from '@/lib/services/auth.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/auth/refresh
 * Public route — no access token required (proxy.ts classifies it as public).
 * Returns 200 { accessToken, refreshToken } on success.
 * Returns 401 on invalid/expired/revoked refresh token.
 * Returns 422 { error: 'validation_failed', issues } on invalid payload.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'validation_failed', issues: ['invalid JSON body'] }, { status: 422 })
  }

  const result = refreshSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const refreshResult = await refresh(result.data.refreshToken)
    return Response.json(refreshResult, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
