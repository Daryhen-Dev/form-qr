import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { createBranchSchema } from '@/lib/validations/branch.schema'
import { createBranch, listBranches } from '@/lib/services/branch.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/branches
 * Creates a new branch. Administrador only.
 * Returns 201 { branch: BranchDTO } on success.
 */
export async function POST(request: NextRequest): Promise<Response> {
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
    return Response.json(
      { error: 'validation_failed', issues: ['invalid JSON body'] },
      { status: 422 }
    )
  }

  const result = createBranchSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const branch = await createBranch(principal, result.data)
    return Response.json({ branch }, { status: 201 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * GET /api/v1/branches
 * Lists all active branches. Administrador and Secretario only.
 * Returns 200 { branches: BranchDTO[] } on success.
 */
export async function GET(request: NextRequest): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  try {
    const branches = await listBranches(principal)
    return Response.json({ branches }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
