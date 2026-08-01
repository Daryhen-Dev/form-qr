import type { NextRequest } from 'next/server'
import { requirePrincipal } from '@/lib/services/request-context'
import { publishVersion } from '@/lib/services/questionnaire.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/questionnaires/[id]/versions/[versionId]/publish
 * Publishes a draft version, making it the current version for the template.
 * Returns 200 { version: QuestionnaireVersionDTO } on success.
 * Returns 401 if unauthenticated.
 * Returns 403 if the caller is Empleado.
 * Returns 404 if the questionnaire or version does not exist.
 * Returns 409 if the version is already published.
 *
 * Next.js 16.2.12: nested dynamic segments resolve both params from a single
 * awaited Promise — const { id, versionId } = await ctx.params
 * (route.md:101–103).
 */
export async function POST(
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
    const version = await publishVersion(principal, id, versionId)
    return Response.json({ version }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
