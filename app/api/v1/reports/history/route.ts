import { requirePrincipal } from '@/lib/services/request-context'
import { historyQuerySchema } from '@/lib/validations/report.schema'
import { getHistory } from '@/lib/services/report.service'
import { ServiceError } from '@/lib/services/auth.service'
import type { NextRequest } from 'next/server'

/**
 * GET /api/v1/reports/history
 *
 * Returns paginated response history enriched with version questions
 * (prompt + type) for the given date range. Admin/Secretario only.
 */
export async function GET(request: NextRequest): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  const params = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = historyQuerySchema.safeParse(params)
  if (!parsed.success) {
    return Response.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    )
  }

  try {
    const result = await getHistory(principal, parsed.data)
    return Response.json(result, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
