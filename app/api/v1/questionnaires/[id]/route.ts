import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { updateQuestionnaireSchema } from '@/lib/validations/questionnaire.schema'
import { getTemplate, updateTemplate, softDeleteTemplate } from '@/lib/services/questionnaire.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * GET /api/v1/questionnaires/[id]
 * Returns 200 { questionnaire: QuestionnaireDTO } on success.
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
    const questionnaire = await getTemplate(principal, id)
    return Response.json({ questionnaire }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * PATCH /api/v1/questionnaires/[id]
 * Updates allowed fields on an existing questionnaire template.
 * Returns 200 { questionnaire: QuestionnaireDTO } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 404 if the questionnaire does not exist or is soft-deleted.
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

  const result = updateQuestionnaireSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const questionnaire = await updateTemplate(principal, id, result.data)
    return Response.json({ questionnaire }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * DELETE /api/v1/questionnaires/[id]
 * Soft-deletes a questionnaire template (sets deletedAt = now).
 * Returns 200 { success: true } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 404 if the questionnaire does not exist or is already soft-deleted.
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
    await softDeleteTemplate(principal, id)
    return Response.json({ success: true }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
