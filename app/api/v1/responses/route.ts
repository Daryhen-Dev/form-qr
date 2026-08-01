import { requirePrincipal } from '@/lib/services/request-context'
import { createResponseSchema } from '@/lib/validations/response.schema'
import { create } from '@/lib/services/response.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/responses
 *
 * Creates a new daily response for the authenticated Empleado.
 * Enforces one-per-(employee, questionnaire, business-day).
 *
 * proxy.ts intentionally does NOT add /api/v1/responses* to any Empleado-denied
 * classifier — these routes are Empleado-reachable by design. The service
 * re-asserts the Empleado role (defense-in-depth). See proxy.ts comment block
 * for the full Empleado-reachable route rationale.
 *
 * Request body: CreateResponseInput (validated by createResponseSchema)
 *   { questionnaireId: string, answers: AnswerInput[] }
 *
 * Returns 201 { response: ResponseDTO } on success.
 * Returns 401 if unauthenticated or token invalid.
 * Returns 403 if caller is not Empleado, or branch/assignment check fails.
 * Returns 404 if the questionnaire is not found or soft-deleted.
 * Returns 409 if a response already exists for today's business day.
 * Returns 422 if the request body fails Zod or service-level config validation.
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

  const result = createResponseSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  // Step 3: delegate to the service (service handles config validation + DB)
  try {
    const response = await create(principal, result.data)
    return Response.json({ response }, { status: 201 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
