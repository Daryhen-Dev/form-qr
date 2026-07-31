import 'server-only'
import { ping } from '@/lib/repositories/health.repository'
import type { HealthCheckResult } from '@/lib/types'

/**
 * Checks the health of the system by performing a DB round-trip.
 * Returns a HealthCheckResult with status 'ok' and the UTC timestamp on success.
 * Re-throws on error — the caller (route handler) is responsible for mapping to HTTP 503.
 */
export async function checkHealth(): Promise<HealthCheckResult> {
  const { now } = await ping()
  return {
    status: 'ok',
    timestamp: now.toISOString(),
  }
}
