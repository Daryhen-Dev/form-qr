import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { getEmployeeBranch } from '@/lib/services/assignment.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/users/[id]/branch
 * Returns the current active branch and full assignment history for a user.
 * History is ordered by assignedAt DESC (newest first).
 * Never returns 404 for an unassigned employee — returns { branch: null, history: [] }.
 *
 * Returns 200 { branch: BranchDTO | null, history: AssignmentDTO[] } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado (already blocked at proxy coarse gate for /api/v1/users*).
 *
 * Note: This endpoint is already covered by the existing /api/v1/users* proxy classifier
 * (Empleado blocked at the coarse gate). No additional proxy changes needed for this route.
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
    const view = await getEmployeeBranch(principal, id)
    return Response.json(view, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
