/**
 * Pure query builders for the operational report endpoints.
 *
 * These functions never perform I/O. They validate user-provided report
 * filters against the Existing API Contracts (see Requirements 6.1-6.7) and
 * produce querystrings that contain ONLY the parameters each endpoint accepts:
 *   - pending:    businessDay (required), branchId?, questionnaireId?
 *   - compliance: from (required), to?, branchId?, questionnaireId?, page?, pageSize?
 *   - history:    from + to (required), employeeId?, questionnaireId?, branchId?, page?, pageSize?
 *
 * Dates must be real calendar days in YYYY-MM-DD form; inclusive ranges are
 * capped at 31 calendar days. Invalid input is reported as a list of field
 * names so callers can associate Field Errors without leaking internals.
 *
 * The heavy PBT coverage (Property 5) arrives in tasks 6.2/6.3; these builders
 * are written to be pure and directly testable.
 */

/** Maximum inclusive date-range span in calendar days (one full month). */
export const MAX_RANGE_DAYS = 31

/** Minimum page number accepted by the paginated report endpoints. */
export const PAGE_MIN = 1

/** Minimum page size accepted by the paginated report endpoints. */
export const PAGE_SIZE_MIN = 1

/** Maximum page size accepted by the paginated report endpoints. */
export const PAGE_SIZE_MAX = 100

const MS_PER_DAY = 86_400_000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface PendingQueryInput {
  readonly businessDay: string
  readonly branchId?: string
  readonly questionnaireId?: string
}

export interface ComplianceQueryInput {
  readonly from: string
  readonly to?: string
  readonly branchId?: string
  readonly questionnaireId?: string
  readonly page?: number
  readonly pageSize?: number
}

export interface HistoryQueryInput {
  readonly from: string
  readonly to: string
  readonly employeeId?: string
  readonly questionnaireId?: string
  readonly branchId?: string
  readonly page?: number
  readonly pageSize?: number
}

export interface ReportQuerySuccess {
  readonly ok: true
  /** Querystring including the leading `?`, e.g. `?businessDay=2024-01-01`. */
  readonly query: string
}

export interface ReportQueryFailure {
  readonly ok: false
  /** Field names whose values are invalid, in canonical parameter order. */
  readonly invalidFields: readonly string[]
}

export type ReportQueryResult = ReportQuerySuccess | ReportQueryFailure

/**
 * Returns true when `value` is a real calendar day in `YYYY-MM-DD` form.
 * `Date` tolerates overflow (Feb 30 becomes Mar 2), so the parsed date is
 * round-tripped and compared against the input to reject unreal dates.
 */
export function isRealCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return false
  }

  return parsed.toISOString().slice(0, 10) === value
}

/**
 * Returns true when `from` and `to` are both real dates, `to` is not before
 * `from`, and the inclusive span is at most {@link MAX_RANGE_DAYS} days.
 */
export function isWithinAllowedRange(from: string, to: string): boolean {
  if (!isRealCalendarDate(from) || !isRealCalendarDate(to)) {
    return false
  }

  const fromMs = Date.parse(`${from}T00:00:00.000Z`)
  const toMs = Date.parse(`${to}T00:00:00.000Z`)
  if (toMs < fromMs) {
    return false
  }

  const inclusiveDays = (toMs - fromMs) / MS_PER_DAY + 1
  return inclusiveDays <= MAX_RANGE_DAYS
}

/** Returns true when `value` is a valid 1-based page number. */
export function isValidPage(value: number): boolean {
  return Number.isInteger(value) && value >= PAGE_MIN
}

/** Returns true when `value` is a valid page size within the accepted bounds. */
export function isValidPageSize(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= PAGE_SIZE_MIN &&
    value <= PAGE_SIZE_MAX
  )
}

/** True when an optional string filter carries a value worth sending. */
function hasFilterValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Appends a required date filter or records its field name as invalid.
 * Shared by every builder that requires a real calendar day (`businessDay`
 * for pending, `from` for compliance and history).
 */
function appendRequiredDate(
  params: URLSearchParams,
  key: string,
  value: string,
  invalidFields: string[]
): void {
  if (isRealCalendarDate(value)) {
    params.set(key, value)
  } else {
    invalidFields.push(key)
  }
}

/**
 * Classification of the `to` bound of a report date range relative to `from`.
 *   - `append`: `to` is a real date within {@link MAX_RANGE_DAYS} of a valid `from`.
 *   - `invalid`: `to` is unusable on its own (unreal date or out of range).
 *   - `defer`: `to` looks real but cannot be judged because `from` is invalid.
 *
 * `isWithinAllowedRange` already rejects unreal `from`/`to` values, so callers
 * only need this single predicate to decide how to treat the range end.
 */
type RangeEnd = 'append' | 'invalid' | 'defer'

/** Classifies the shared range-end (`to`) rule reused by compliance/history. */
function classifyRangeEnd(from: string, to: string): RangeEnd {
  if (!isRealCalendarDate(to)) {
    return 'invalid'
  }
  if (!isRealCalendarDate(from)) {
    return 'defer'
  }
  return isWithinAllowedRange(from, to) ? 'append' : 'invalid'
}

function appendFilter(
  params: URLSearchParams,
  key: string,
  value: string | undefined
): void {
  if (hasFilterValue(value)) {
    params.set(key, value)
  }
}

/**
 * Validates and appends `page`/`pageSize` when provided, recording invalid
 * field names. Omitted values are left to the API's own defaults.
 */
function appendPagination(
  params: URLSearchParams,
  input: { readonly page?: number; readonly pageSize?: number },
  invalidFields: string[]
): void {
  if (input.page !== undefined) {
    if (isValidPage(input.page)) {
      params.set('page', String(input.page))
    } else {
      invalidFields.push('page')
    }
  }

  if (input.pageSize !== undefined) {
    if (isValidPageSize(input.pageSize)) {
      params.set('pageSize', String(input.pageSize))
    } else {
      invalidFields.push('pageSize')
    }
  }
}

function toQuery(params: URLSearchParams): string {
  const serialized = params.toString()
  return serialized.length === 0 ? '' : `?${serialized}`
}

/**
 * Builds the `GET /api/v1/reports/pending` querystring. Requires a real
 * `businessDay`; `branchId` and `questionnaireId` are optional.
 */
export function buildPendingQuery(input: PendingQueryInput): ReportQueryResult {
  const invalidFields: string[] = []
  const params = new URLSearchParams()

  appendRequiredDate(params, 'businessDay', input.businessDay, invalidFields)

  appendFilter(params, 'branchId', input.branchId)
  appendFilter(params, 'questionnaireId', input.questionnaireId)

  if (invalidFields.length > 0) {
    return { ok: false, invalidFields }
  }

  return { ok: true, query: toQuery(params) }
}

/**
 * Builds the `GET /api/v1/reports/compliance` querystring. Requires a real
 * `from`; `to` is optional and, when present, must keep the inclusive range
 * within {@link MAX_RANGE_DAYS} days.
 */
export function buildComplianceQuery(
  input: ComplianceQueryInput
): ReportQueryResult {
  const invalidFields: string[] = []
  const params = new URLSearchParams()

  appendRequiredDate(params, 'from', input.from, invalidFields)

  // `to` is optional: only a real date within range of a valid `from` is sent;
  // an unreal date, an out-of-range span, or an unjudgeable `from` flags `to`.
  if (input.to !== undefined) {
    if (classifyRangeEnd(input.from, input.to) === 'append') {
      params.set('to', input.to)
    } else {
      invalidFields.push('to')
    }
  }

  appendFilter(params, 'branchId', input.branchId)
  appendFilter(params, 'questionnaireId', input.questionnaireId)
  appendPagination(params, input, invalidFields)

  if (invalidFields.length > 0) {
    return { ok: false, invalidFields }
  }

  return { ok: true, query: toQuery(params) }
}

/**
 * Builds the `GET /api/v1/reports/history` querystring. Requires real `from`
 * and `to` values whose inclusive range stays within {@link MAX_RANGE_DAYS}
 * days; `employeeId`, `questionnaireId` and `branchId` are optional.
 */
export function buildHistoryQuery(input: HistoryQueryInput): ReportQueryResult {
  const invalidFields: string[] = []
  const params = new URLSearchParams()

  appendRequiredDate(params, 'from', input.from, invalidFields)

  // `to` is required: it is flagged only when unusable on its own (unreal date
  // or out-of-range span). When `from` is already invalid the range cannot be
  // judged, so `to` is left untouched and only `from` carries the error.
  if (classifyRangeEnd(input.from, input.to) === 'invalid') {
    invalidFields.push('to')
  } else {
    params.set('to', input.to)
  }

  appendFilter(params, 'employeeId', input.employeeId)
  appendFilter(params, 'questionnaireId', input.questionnaireId)
  appendFilter(params, 'branchId', input.branchId)
  appendPagination(params, input, invalidFields)

  if (invalidFields.length > 0) {
    return { ok: false, invalidFields }
  }

  return { ok: true, query: toQuery(params) }
}
