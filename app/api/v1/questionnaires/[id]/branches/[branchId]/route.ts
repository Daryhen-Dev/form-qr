import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { unassignBranch } from '@/lib/services/questionnaire-branch.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * DELETE /api/v1/questionnaires/[id]/branches/[branchId]
 * Removes the assignment between a questionnaire template and a branch.
 * Returns 200 { success: true } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 404 if the assignment does not exist.
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; branchId: string }> }
): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  const { id, branchId } = await ctx.params

  try {
    await unassignBranch(principal, id, branchId)
    return Response.json({ success: true }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
