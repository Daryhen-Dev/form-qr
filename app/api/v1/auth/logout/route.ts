import { requirePrincipal } from '@/lib/services/request-context'
import { logout } from '@/lib/services/auth.service'

/**
 * POST /api/v1/auth/logout
 * Requires a valid access token (allowed even when passwordChangeRequired=true — proxy exempts it).
 * Reads the refresh token from the request body and revokes it.
 * Returns 200 { success: true } — always succeeds (idempotent).
 */
export async function POST(request: Request): Promise<Response> {
  // Re-verify the principal (proxy already checked, but handlers re-verify per Next.js guidance)
  try {
    await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const refreshToken =
    typeof (body as Record<string, unknown>).refreshToken === 'string'
      ? (body as Record<string, unknown>).refreshToken as string
      : null

  if (refreshToken) {
    await logout(refreshToken)
  }

  return Response.json({ success: true }, { status: 200 })
}
