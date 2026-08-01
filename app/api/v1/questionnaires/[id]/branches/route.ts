import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { assignBranchSchema } from '@/lib/validations/assignment-branch.schema'
import {
  assignBranch,
  listBranchesForTemplate,
} from '@/lib/services/questionnaire-branch.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/questionnaires/[id]/branches
 * Lists all branches assigned to a questionnaire template.
 * Returns 200 { assignments: QuestionnaireBranchDTO[] } on success.
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
    const assignments = await listBranchesForTemplate(principal, id)
    return Response.json({ assignments }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * POST /api/v1/questionnaires/[id]/branches
 * Assigns a questionnaire template to a branch.
 * Returns 201 { assignment: QuestionnaireBranchDTO } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 404 if the questionnaire or branch does not exist.
 * Returns 409 if the assignment already exists.
 * Returns 422 if the branch is inactive (soft-deleted) or body is invalid.
 */
export async function POST(
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'validation_failed', issues: ['invalid JSON body'] }, { status: 422 })
  }

  const result = assignBranchSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const assignment = await assignBranch(principal, id, result.data.branchId)
    return Response.json({ assignment }, { status: 201 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
