import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { assignSchema } from '@/lib/validations/assignment.schema'
import { assignEmployee } from '@/lib/services/assignment.service'
import { findActiveByBranch } from '@/lib/repositories/branch-assignment.repository'
import { findById as findBranch } from '@/lib/repositories/branch.repository'
import { ServiceError } from '@/lib/services/auth.service'
import type { AssignmentDTO } from '@/lib/types'

/**
 * GET /api/v1/branches/[id]/employees
 * Lists active assignment rows for an active branch.
 * This historical read intentionally uses repository calls; it never accesses Prisma.
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

  if (principal.role === 'Empleado') {
    return Response.json({ error: 'insufficient_permissions' }, { status: 403 })
  }

  const { id } = await ctx.params

  const branch = await findBranch(id)
  if (!branch) {
    return Response.json({ error: 'branch_not_found' }, { status: 404 })
  }

  const rows = await findActiveByBranch(id)
  const employees: AssignmentDTO[] = rows.map((row) => ({
    id: row.id,
    branchId: row.branchId,
    userId: row.userId,
    assignedAt: row.assignedAt.toISOString(),
    unassignedAt: row.unassignedAt ? row.unassignedAt.toISOString() : null,
  }))

  return Response.json({ employees }, { status: 200 })
}

/**
 * POST /api/v1/branches/[id]/employees
 * Assigns or reassigns an Empleado-role user to this branch.
 * Body: { userId: string }
 * Returns 201 { assignment: AssignmentDTO } on success.
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
    return Response.json(
      { error: 'validation_failed', issues: ['invalid JSON body'] },
      { status: 422 }
    )
  }

  const result = assignSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const assignment = await assignEmployee(principal, id, result.data)
    return Response.json({ assignment }, { status: 201 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
