import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { getVersion } from '@/lib/services/questionnaire.service'
import { ServiceError } from '@/lib/services/auth.service'

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
