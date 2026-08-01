import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { resolveScan } from '@/lib/services/scan.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/scan/[qrToken]
 *
 * Resolves a QR scan for an Empleado. Executes ordered validation gates:
 *  1. Valid Empleado JWT — else 401 (from requirePrincipal) or 403 (wrong role).
 *  2. Questionnaire exists for token — else 404.
 *  3. Employee's active branch has this questionnaire assigned — else 403.
 *  4. Questionnaire has a current published version — else 422.
 *  5. Returns resolved version, ordered questions, and today's response status.
 *
 * proxy.ts intentionally does NOT add /api/v1/scan* to any Empleado-denied
 * classifier — these routes are Empleado-reachable by design. The service
 * re-asserts the Empleado role (defense-in-depth). See proxy.ts comment block
 * for the full Empleado-reachable route rationale.
 *
 * Returns 200 { scan: ScanResolutionDTO }
 * Returns 401 if unauthenticated or token invalid.
 * Returns 403 if caller is not Empleado, or branch/assignment check fails.
 * Returns 404 if the questionnaire is not found or soft-deleted.
 * Returns 422 if the questionnaire has no published version.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ qrToken: string }> }
): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  const { qrToken } = await ctx.params

  try {
    const scan = await resolveScan(principal, qrToken)
    return Response.json({ scan }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
