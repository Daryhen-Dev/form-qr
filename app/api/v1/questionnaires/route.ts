import { requirePrincipal } from '@/lib/services/request-context'
import { createQuestionnaireSchema } from '@/lib/validations/questionnaire.schema'
import { createTemplate, listTemplates } from '@/lib/services/questionnaire.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/questionnaires
 * Creates a new questionnaire template.
 * Returns 201 { questionnaire: QuestionnaireDTO } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 422 { error: 'validation_failed', issues } on invalid payload.
 */
export async function POST(request: Request): Promise<Response> {
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
    return Response.json({ error: 'validation_failed', issues: ['invalid JSON body'] }, { status: 422 })
  }

  const result = createQuestionnaireSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const questionnaire = await createTemplate(principal, result.data)
    return Response.json({ questionnaire }, { status: 201 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * GET /api/v1/questionnaires
 * Lists all active questionnaire templates.
 * Returns 200 { questionnaires: QuestionnaireDTO[] } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 */
export async function GET(request: Request): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  try {
    const questionnaires = await listTemplates(principal)
    return Response.json({ questionnaires }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
