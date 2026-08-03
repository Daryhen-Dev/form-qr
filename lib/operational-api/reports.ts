/**
 * Report API clients (Requirements 6.1-6.7, 7.6-7.8).
 *
 * Each function validates filters through the pure builders in
 * `report-query.ts`, and only on success issues a single authenticated
 * `GET` against the Existing API Contract. Client-side validation failures
 * are surfaced as a validation `ProtectedResult` that associates each invalid
 * filter with a Field Error, mirroring how a server-side HTTP 422 is handled.
 *
 * Responses are validated as `unknown` and projected into the report DTOs.
 * A malformed body yields a retryable result (Requirement 7.7).
 */
import { HTTP_METHOD, requestProtected } from '@/lib/operational-api/client'
import {
  createValidationResult,
  type ComplianceReportDTO,
  type ComplianceDetailDTO,
  type ComplianceSummaryDTO,
  type HistoryEntryDTO,
  type HistoryReportDTO,
  type Paginated,
  type PendingEntryDTO,
  type PendingReportDTO,
  type ProtectedResult,
} from '@/lib/operational-api/contracts'
import {
  buildComplianceQuery,
  buildHistoryQuery,
  buildPendingQuery,
  type ComplianceQueryInput,
  type HistoryQueryInput,
  type PendingQueryInput,
  type ReportQueryResult,
} from '@/lib/operational-api/report-query'

const REPORT_PATH = {
  PENDING: '/reports/pending',
  COMPLIANCE: '/reports/compliance',
  HISTORY: '/reports/history',
} as const

/** Filter fields that may be surfaced as Field Errors on the pending form. */
const PENDING_FILTER_FIELDS = [
  'businessDay',
  'branchId',
  'questionnaireId',
] as const

/** Filter fields that may be surfaced as Field Errors on the compliance form. */
const COMPLIANCE_FILTER_FIELDS = [
  'from',
  'to',
  'branchId',
  'questionnaireId',
  'page',
  'pageSize',
] as const

/** Filter fields that may be surfaced as Field Errors on the history form. */
const HISTORY_FILTER_FIELDS = [
  'from',
  'to',
  'employeeId',
  'questionnaireId',
  'branchId',
  'page',
  'pageSize',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Validates the shared pagination envelope and projects each item with the
 * supplied projector. Returns `undefined` when the envelope or any item is
 * malformed.
 */
function projectPaginated<T>(
  value: unknown,
  projectItem: (item: unknown) => T | undefined
): Paginated<T> | undefined {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return undefined
  }

  if (
    !isFiniteNumber(value.page) ||
    !isFiniteNumber(value.pageSize) ||
    !isFiniteNumber(value.total)
  ) {
    return undefined
  }

  const items: T[] = []
  for (const rawItem of value.items) {
    const item = projectItem(rawItem)
    if (item === undefined) {
      return undefined
    }
    items.push(item)
  }

  return {
    items,
    page: value.page,
    pageSize: value.pageSize,
    total: value.total,
  }
}

function projectPendingEntry(value: unknown): PendingEntryDTO | undefined {
  if (!isRecord(value)) return undefined
  if (
    !isNonEmptyString(value.employeeId) ||
    !isNonEmptyString(value.employeeName) ||
    !isNonEmptyString(value.branchId) ||
    !isNonEmptyString(value.branchName) ||
    !isNonEmptyString(value.questionnaireId) ||
    !isNonEmptyString(value.questionnaireTitle)
  ) {
    return undefined
  }

  return {
    employeeId: value.employeeId,
    employeeName: value.employeeName,
    branchId: value.branchId,
    branchName: value.branchName,
    questionnaireId: value.questionnaireId,
    questionnaireTitle: value.questionnaireTitle,
  }
}

function projectPendingReport(payload: unknown): PendingReportDTO | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.pending)) {
    return undefined
  }
  if (!isNonEmptyString(payload.businessDay)) {
    return undefined
  }

  const pending: PendingEntryDTO[] = []
  for (const rawEntry of payload.pending) {
    const entry = projectPendingEntry(rawEntry)
    if (entry === undefined) {
      return undefined
    }
    pending.push(entry)
  }

  return { businessDay: payload.businessDay, pending }
}

function projectComplianceSummary(
  value: unknown
): ComplianceSummaryDTO | undefined {
  if (!isRecord(value)) return undefined
  if (
    !isFiniteNumber(value.totalAssigned) ||
    !isFiniteNumber(value.responded) ||
    !isFiniteNumber(value.pending) ||
    !isFiniteNumber(value.complianceRate)
  ) {
    return undefined
  }

  return {
    totalAssigned: value.totalAssigned,
    responded: value.responded,
    pending: value.pending,
    complianceRate: value.complianceRate,
  }
}

function projectComplianceDetail(
  value: unknown
): ComplianceDetailDTO | undefined {
  if (!isRecord(value)) return undefined
  if (
    !isNonEmptyString(value.questionnaireId) ||
    !isNonEmptyString(value.questionnaireTitle) ||
    !isNonEmptyString(value.branchId) ||
    !isNonEmptyString(value.branchName) ||
    !isNonEmptyString(value.employeeId) ||
    !isNonEmptyString(value.employeeName) ||
    !isBoolean(value.responded) ||
    !isNonEmptyString(value.businessDay)
  ) {
    return undefined
  }

  return {
    questionnaireId: value.questionnaireId,
    questionnaireTitle: value.questionnaireTitle,
    branchId: value.branchId,
    branchName: value.branchName,
    employeeId: value.employeeId,
    employeeName: value.employeeName,
    responded: value.responded,
    businessDay: value.businessDay,
  }
}

function projectComplianceReport(
  payload: unknown
): ComplianceReportDTO | undefined {
  if (!isRecord(payload)) return undefined
  if (!isNonEmptyString(payload.from) || !isNonEmptyString(payload.to)) {
    return undefined
  }

  const summary = projectComplianceSummary(payload.summary)
  const details = projectPaginated(payload.details, projectComplianceDetail)
  if (summary === undefined || details === undefined) {
    return undefined
  }

  return { from: payload.from, to: payload.to, summary, details }
}

function projectHistoryEntry(value: unknown): HistoryEntryDTO | undefined {
  if (!isRecord(value)) return undefined
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.employeeId) ||
    !isNonEmptyString(value.employeeName) ||
    !isNonEmptyString(value.questionnaireId) ||
    !isNonEmptyString(value.questionnaireTitle) ||
    !isNonEmptyString(value.versionId) ||
    !isFiniteNumber(value.versionNumber) ||
    !isNonEmptyString(value.businessDay) ||
    !isNonEmptyString(value.createdAt) ||
    !Array.isArray(value.answers)
  ) {
    return undefined
  }

  return {
    id: value.id,
    employeeId: value.employeeId,
    employeeName: value.employeeName,
    questionnaireId: value.questionnaireId,
    questionnaireTitle: value.questionnaireTitle,
    versionId: value.versionId,
    versionNumber: value.versionNumber,
    businessDay: value.businessDay,
    createdAt: value.createdAt,
    answers: value.answers.map((answer) => ({
      questionId: isRecord(answer) && isNonEmptyString(answer.questionId)
        ? answer.questionId
        : '',
      prompt: isRecord(answer) && typeof answer.prompt === 'string'
        ? answer.prompt
        : '',
      type: isRecord(answer) && typeof answer.type === 'string'
        ? answer.type
        : '',
      value: isRecord(answer) ? answer.value : undefined,
    })),
  }
}

function projectHistoryReport(payload: unknown): HistoryReportDTO | undefined {
  if (!isRecord(payload)) return undefined
  if (!isNonEmptyString(payload.from) || !isNonEmptyString(payload.to)) {
    return undefined
  }

  const results = projectPaginated(payload.results, projectHistoryEntry)
  if (results === undefined) {
    return undefined
  }

  return { from: payload.from, to: payload.to, results }
}

function validationFailure<T>(
  built: Extract<ReportQueryResult, { ok: false }>
): ProtectedResult<T> {
  return createValidationResult(built.invalidFields, false)
}

/**
 * Fetches the pending-employees report. Validates `businessDay` and optional
 * filters before issuing `GET /api/v1/reports/pending`.
 */
export async function fetchPendingReport(
  accessToken: string,
  input: PendingQueryInput
): Promise<ProtectedResult<PendingReportDTO>> {
  const built = buildPendingQuery(input)
  if (!built.ok) {
    return validationFailure<PendingReportDTO>(built)
  }

  return requestProtected<PendingReportDTO>({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `${REPORT_PATH.PENDING}${built.query}`,
    project: projectPendingReport,
    visibleFieldNames: PENDING_FILTER_FIELDS,
  })
}

/**
 * Fetches the compliance report. Validates `from`, optional `to`, the 31-day
 * range cap, filters and pagination before issuing
 * `GET /api/v1/reports/compliance`.
 */
export async function fetchComplianceReport(
  accessToken: string,
  input: ComplianceQueryInput
): Promise<ProtectedResult<ComplianceReportDTO>> {
  const built = buildComplianceQuery(input)
  if (!built.ok) {
    return validationFailure<ComplianceReportDTO>(built)
  }

  return requestProtected<ComplianceReportDTO>({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `${REPORT_PATH.COMPLIANCE}${built.query}`,
    project: projectComplianceReport,
    visibleFieldNames: COMPLIANCE_FILTER_FIELDS,
  })
}

/**
 * Fetches the history report. Validates `from`/`to`, the 31-day range cap,
 * filters and pagination before issuing `GET /api/v1/reports/history`.
 */
export async function fetchHistoryReport(
  accessToken: string,
  input: HistoryQueryInput
): Promise<ProtectedResult<HistoryReportDTO>> {
  const built = buildHistoryQuery(input)
  if (!built.ok) {
    return validationFailure<HistoryReportDTO>(built)
  }

  return requestProtected<HistoryReportDTO>({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `${REPORT_PATH.HISTORY}${built.query}`,
    project: projectHistoryReport,
    visibleFieldNames: HISTORY_FILTER_FIELDS,
  })
}
