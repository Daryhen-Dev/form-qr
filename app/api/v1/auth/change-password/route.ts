import { requirePrincipal } from '@/lib/services/request-context'
import { changePasswordSchema } from '@/lib/validations/auth.schema'
import { changePassword } from '@/lib/services/auth.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/auth/change-password
 * Requires a valid access token (allowed even when passwordChangeRequired=true — proxy exempts it).
 * Returns 200 { success: true } on success.
 * Returns 401 if the token is missing or invalid.
 * Returns 422 { error: 'validation_failed', issues } on invalid payload.
 */
export async function POST(request: Request): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'validation_failed', issues: ['invalid JSON body'] }, { status: 422 })
  }

  const result = changePasswordSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    await changePassword(principal.userId, result.data.newPassword)
    return Response.json({ success: true }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
