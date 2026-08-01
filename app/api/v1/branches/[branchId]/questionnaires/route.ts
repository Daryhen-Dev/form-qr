import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { listTemplatesForBranch } from '@/lib/services/questionnaire-branch.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/branches/[branchId]/questionnaires
 * Lists all questionnaire templates assigned to a branch.
 * Returns 200 { assignments: QuestionnaireBranchDTO[] } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado (enforced at service layer).
 *
 * Note: /api/v1/branches/* routes are covered by the JWT gate in proxy.ts
 * (all /api/* routes require a valid token). Role enforcement for this endpoint
 * is handled in the service layer — Empleado receives 403.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ branchId: string }> }
): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  const { branchId } = await ctx.params

  try {
    const assignments = await listTemplatesForBranch(principal, branchId)
    return Response.json({ assignments }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
