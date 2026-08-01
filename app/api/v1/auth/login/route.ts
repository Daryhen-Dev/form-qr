import { loginSchema } from '@/lib/validations/auth.schema'
import { login } from '@/lib/services/auth.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/auth/login
 * Public route — no token required (proxy.ts classifies it as public).
 * Returns 200 { accessToken, refreshToken, passwordChangeRequired, user } on success.
 * Returns 401 { error: 'invalid_credentials' } on bad credentials.
 * Returns 422 { error: 'validation_failed', issues } on invalid payload.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'validation_failed', issues: ['invalid JSON body'] }, { status: 422 })
  }

  const result = loginSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const loginResult = await login(result.data.cedula, result.data.password)
    return Response.json(loginResult, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
