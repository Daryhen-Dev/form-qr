import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { getQr } from '@/lib/services/qr.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/questionnaires/[id]/qr
 *
 * Returns the permanent QR data for a questionnaire template.
 * The qrToken is stable across version publishes and soft-deletes.
 *
 * Authorization: Administrador or Secretario only.
 * The proxy classifier `requiresQuestionnaireRole` already blocks Empleado at
 * the edge (startsWith '/api/v1/questionnaires'), so this route only receives
 * Admin/Sec principals. The service re-asserts the role (defense-in-depth).
 *
 * Returns 200 { qr: QrDTO }
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 404 if the questionnaire does not exist or is soft-deleted.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  const { id } = await ctx.params

  try {
    const qr = await getQr(principal, id)
    return Response.json({ qr }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
