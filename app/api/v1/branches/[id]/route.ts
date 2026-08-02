import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { updateBranchSchema } from '@/lib/validations/branch.schema'
import {
  getBranch,
  updateBranch,
  softDeleteBranch,
} from '@/lib/services/branch.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/branches/[id]
 * Returns 200 { branch: BranchDTO } on success.
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
    const branch = await getBranch(principal, id)
    return Response.json({ branch }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * PATCH /api/v1/branches/[id]
 * Updates allowed fields. Administrador only.
 * Returns 200 { branch: BranchDTO } on success.
 */
export async function PATCH(
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

  const result = updateBranchSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const branch = await updateBranch(principal, id, result.data)
    return Response.json({ branch }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * DELETE /api/v1/branches/[id]
 * Soft-deletes a branch. Administrador only.
 * Returns 200 { success: true } on success.
 */
export async function DELETE(
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
    await softDeleteBranch(principal, id)
    return Response.json({ success: true }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
