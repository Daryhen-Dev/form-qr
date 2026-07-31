/**
 * Shared TypeScript interfaces for form-qr.
 * Plain TS interfaces only — no @prisma/client imports allowed here (NFR-3).
 */

/** Result returned by the health check service. */
export interface HealthCheckResult {
  status: 'ok' | 'error'
  /** UTC ISO-8601 timestamp from the database round-trip. Present on success. */
  timestamp?: string
  /** Short error code. Present on failure. */
  error?: string
}
