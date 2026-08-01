/**
 * Zod query schemas for report endpoints (Slice 6).
 *
 * Structural validation for GET query params: date format, range cap (31 days),
 * pagination bounds (page ≥ 1, pageSize 1–100, defaults 1/20).
 *
 * Uses Zod 4 conventions: `error:` param where applicable.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Maximum inclusive date range in days (covers one full month). */
const MAX_RANGE_DAYS = 31

/**
 * Validates a YYYY-MM-DD string and confirms it represents a real calendar date.
 * Date.parse tolerates overflow (e.g. Feb 30 → Mar 2), so we round-trip check
 * that the ISO output matches the input.
 */
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'invalid_date_format' })
  .refine(
    (s) => {
      const d = new Date(`${s}T00:00:00.000Z`)
      if (Number.isNaN(d.getTime())) return false
      // Round-trip: parsed date's ISO prefix must match the input
      return d.toISOString().slice(0, 10) === s
    },
    { error: 'invalid_date' }
  )

/** Optional non-empty string id (branchId, questionnaireId, employeeId). */
const optId = z.string().min(1).optional()

/** Coerced page number: integer ≥ 1, defaults to 1. */
const page = z.coerce
  .number()
  .int()
  .min(1, { error: 'invalid_page' })
  .default(1)

/** Coerced pageSize: integer 1–100, defaults to 20. */
const pageSize = z.coerce
  .number()
  .int()
  .min(1, { error: 'invalid_page_size' })
  .max(100, { error: 'invalid_page_size' })
  .default(20)

/**
 * Returns true when (from, to) span at most MAX_RANGE_DAYS days inclusive
 * and to >= from.
 */
function withinRange(from: string, to: string): boolean {
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  if (toMs < fromMs) return false
  return (toMs - fromMs) / 86_400_000 <= MAX_RANGE_DAYS - 1
}

// ---------------------------------------------------------------------------
// Compliance query schema
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/reports/compliance query params.
 * `to` defaults to `from` when omitted (single-day query).
 */
export const complianceQuerySchema = z
  .object({
    from: dateStr,
    to: dateStr.optional(),
    branchId: optId,
    questionnaireId: optId,
    page,
    pageSize,
  })
  .transform((q) => ({ ...q, to: q.to ?? q.from }))
  .refine((q) => withinRange(q.from, q.to), {
    error: 'range_too_large',
    path: ['to'],
  })

// ---------------------------------------------------------------------------
// Pending query schema
// ---------------------------------------------------------------------------

/** GET /api/v1/reports/pending query params. */
export const pendingQuerySchema = z.object({
  businessDay: dateStr,
  branchId: optId,
  questionnaireId: optId,
})

// ---------------------------------------------------------------------------
// History query schema
// ---------------------------------------------------------------------------

/** GET /api/v1/reports/history query params. */
export const historyQuerySchema = z
  .object({
    from: dateStr,
    to: dateStr,
    employeeId: optId,
    questionnaireId: optId,
    branchId: optId,
    page,
    pageSize,
  })
  .refine((q) => withinRange(q.from, q.to), {
    error: 'range_too_large',
    path: ['to'],
  })

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ComplianceQuery = z.infer<typeof complianceQuerySchema>
export type PendingQuery = z.infer<typeof pendingQuerySchema>
export type HistoryQuery = z.infer<typeof historyQuerySchema>
