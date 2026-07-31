import { checkHealth } from '@/lib/services/health.service'

/**
 * GET /api/v1/health
 * Exercises the full service → repository → database path.
 * Returns 200 { status: 'ok', timestamp: <UTC ISO> } on success.
 * Returns 503 { status: 'error', error: 'database_unreachable' } on DB failure.
 * No params/cookies/headers consumed by this handler (none needed).
 */
export async function GET(): Promise<Response> {
  try {
    const { timestamp } = await checkHealth()
    return Response.json({ status: 'ok', timestamp })
  } catch {
    return Response.json(
      { status: 'error', error: 'database_unreachable' },
      { status: 503 }
    )
  }
}
