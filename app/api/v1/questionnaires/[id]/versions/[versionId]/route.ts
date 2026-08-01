import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { getVersion, setVersionQuestions } from '@/lib/services/questionnaire.service'
import { ServiceError } from '@/lib/services/auth.service'
import { setQuestionsSchema } from '@/lib/validations/question.schema'

/**
 * GET /api/v1/questionnaires/[id]/versions/[versionId]
 * Returns the version with its ordered questions.
 * Returns 200 { version: QuestionnaireVersionDTO & { questions: QuestionDTO[] } } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 404 if the questionnaire or version does not exist.
 *
 * Next.js 16.2.12: nested dynamic segments resolve both params from a single
 * awaited Promise — const { id, versionId } = await ctx.params
 * (route.md:101–103).
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; versionId: string }> }
): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  const { id, versionId } = await ctx.params

  try {
    const version = await getVersion(principal, id, versionId)
    return Response.json({ version }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * PATCH /api/v1/questionnaires/[id]/versions/[versionId]
 * Sets (replaces) the full ordered question set for a draft version.
 *
 * Body: { questions: QuestionInput[] } — validated by setQuestionsSchema.
 *
 * Returns 200 { version: QuestionnaireVersionDTO & { questions: QuestionDTO[] } } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 404 if the questionnaire or version does not exist.
 * Returns 409 { error: 'version_immutable' } if the version is already published.
 * Returns 422 if the request body fails Zod validation (invalid types, duplicate order, etc.).
 *
 * Next.js 16.2.12: const { id, versionId } = await ctx.params
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; versionId: string }> }
): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  const { id, versionId } = await ctx.params

  // Parse and validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 422 })
  }

  const parsed = setQuestionsSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'validation_error', issues: parsed.error.issues }, { status: 422 })
  }

  try {
    const version = await setVersionQuestions(principal, id, versionId, parsed.data)
    return Response.json({ version }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
