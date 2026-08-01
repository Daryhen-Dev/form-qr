import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { createVersionSchema } from '@/lib/validations/questionnaire.schema'
import { createVersion, listVersions } from '@/lib/services/questionnaire.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/questionnaires/[id]/versions
 * Creates a new draft version for the questionnaire template.
 * Returns 201 { version: QuestionnaireVersionDTO } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 404 if the questionnaire does not exist or is soft-deleted.
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

  // Parse body — allow empty/absent body for version creation
  let body: unknown = {}
  try {
    const raw = await request.text()
    if (raw.trim()) {
      body = JSON.parse(raw)
    }
  } catch {
    return Response.json({ error: 'validation_failed', issues: ['invalid JSON body'] }, { status: 422 })
  }

  const result = createVersionSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const version = await createVersion(principal, id)
    return Response.json({ version }, { status: 201 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}

/**
 * GET /api/v1/questionnaires/[id]/versions
 * Lists all versions for the questionnaire template.
 * Returns 200 { versions: QuestionnaireVersionDTO[] } on success.
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
    const versions = await listVersions(principal, id)
    return Response.json({ versions }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
