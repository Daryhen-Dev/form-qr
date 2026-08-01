import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { updateResponseSchema } from '@/lib/validations/response.schema'
import { get, update } from '@/lib/services/response.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/responses/[id]
 *
 * Returns the caller's own response with answers and edit-window status.
 *
 * proxy.ts intentionally does NOT add /api/v1/responses* to any Empleado-denied
 * classifier — these routes are Empleado-reachable by design. The service
 * re-asserts ownership (non-owner → 404, anti-enumeration).
 *
 * Returns 200 { response: ResponseDTO } on success.
 * Returns 401 if unauthenticated.
 * Returns 404 if the response does not exist or is not owned by the caller.
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
    const response = await get(principal, id)
    return Response.json({ response }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * PATCH /api/v1/responses/[id]
 *
 * Updates the response's answers within the same-day edit window.
 * Replaces all answers atomically.
 *
 * Returns 200 { response: ResponseDTO } on success.
 * Returns 401 if unauthenticated.
 * Returns 404 if the response does not exist or is not owned by the caller.
 * Returns 409 if the edit window has closed (past business day).
 * Returns 422 if the request body fails Zod or service-level config validation.
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

  const result = updateResponseSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const response = await update(principal, id, result.data)
    return Response.json({ response }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
