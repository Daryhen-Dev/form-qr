import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { updateUserSchema } from '@/lib/validations/user.schema'
import { getUser, updateUser, softDeleteUser } from '@/lib/services/user.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/users/[id]
 * Returns 200 { user: UserDTO } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 on insufficient role.
 * Returns 404 if the user does not exist or is soft-deleted.
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
    const user = await getUser(principal, id)
    return Response.json({ user }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * PATCH /api/v1/users/[id]
 * Updates allowed fields (nombres, apellidos) on an existing user.
 * Role and cédula are immutable — updateUserSchema strips them.
 * Returns 200 { user: UserDTO } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 on insufficient role or authorization failure.
 * Returns 404 if the user does not exist or is soft-deleted.
 * Returns 422 on invalid payload.
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
    return Response.json({ error: 'validation_failed', issues: ['invalid JSON body'] }, { status: 422 })
  }

  const result = updateUserSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const user = await updateUser(principal, id, result.data)
    return Response.json({ user }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * DELETE /api/v1/users/[id]
 * Soft-deletes a user (sets deletedAt = now). Administrador only.
 * Returns 200 { success: true } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is not an Administrador.
 * Returns 404 if the user does not exist or is already soft-deleted.
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
    await softDeleteUser(principal, id)
    return Response.json({ success: true }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
