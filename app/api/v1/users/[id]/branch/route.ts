import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { getEmployeeBranch } from '@/lib/services/assignment.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/users/[id]/branch
 * Returns the current branch and full assignment history for a user.
 * Unassigned users return { branch: null, history: [] }.
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
