import { requirePrincipal } from '@/lib/services/request-context'
import { presignSchema } from '@/lib/validations/response.schema'
import { issuePresign } from '@/lib/services/upload.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/uploads/presign
 *
 * Issues a presigned PUT URL for a photo/file question on a questionnaire
 * assigned to the calling Empleado's active branch.
 *
 * proxy.ts intentionally does NOT add /api/v1/uploads* to any Empleado-denied
 * classifier — these routes are Empleado-reachable by design (same rationale
 * as /api/v1/responses* and /api/v1/scan*). The service re-asserts the
 * Empleado role + assignment checks (defense-in-depth).
 *
 * Request body: PresignInput (validated by presignSchema)
 *   { questionnaireId: string, questionId: string, mimeType: string, sizeBytes: number }
 *
 * Returns 200 { uploadUrl: string, objectKey: string } on success.
 * Returns 401 if unauthenticated or token invalid.
 * Returns 403 if caller is not Empleado, or branch/assignment check fails.
 * Returns 404 if the questionnaire or question is not found.
 * Returns 422 if the request body fails Zod, or question type/mime/size validation fails.
 */
export async function POST(request: Request): Promise<Response> {
  // Step 1: verify the bearer token and extract the principal
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  // Step 2: parse and structurally validate the request body (Zod boundary)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'validation_failed', issues: ['invalid JSON body'] },
      { status: 422 }
    )
  }

  const result = presignSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  // Step 3: delegate to the service (service handles all gates)
  try {
    const presignResult = await issuePresign(principal, result.data)
    return Response.json(presignResult, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
