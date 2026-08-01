import 'server-only'
import {
  findActiveEmployeeAssignments,
  findAssignedQuestionnaires,
  findRespondedKeys,
  findHistoryPage,
  countHistory,
} from '@/lib/repositories/report.repository'
import { ServiceError } from '@/lib/services/auth.service'
import type { Principal } from '@/lib/types'
import type {
  ComplianceReportDTO,
  PendingReportDTO,
  HistoryReportDTO,
  ComplianceDetailDTO,
  PendingEntryDTO,
  HistoryEntryDTO,
} from '@/lib/types'
import type { ComplianceQuery, PendingQuery, HistoryQuery } from '@/lib/validations/report.schema'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Re-asserts Admin/Secretario role (defense-in-depth over proxy). */
function assertReportRole(principal: Principal): void {
  if (principal.role !== 'Administrador' && principal.role !== 'Secretario') {
    throw new ServiceError(403, 'insufficient_permissions')
  }
}

/** Converts a business-day string to a UTC midnight Date for DB comparison. */
function toBusinessDayDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

/**
 * Generates an array of business-day date strings between from and to (inclusive).
 */
function dateRange(from: string, to: string): string[] {
  const days: string[] = []
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let ms = start; ms <= end; ms += 86_400_000) {
    days.push(new Date(ms).toISOString().slice(0, 10))
  }
  return days
}

// ---------------------------------------------------------------------------
// getCompliance
// ---------------------------------------------------------------------------

export async function getCompliance(
  principal: Principal,
  query: ComplianceQuery
): Promise<ComplianceReportDTO> {
  assertReportRole(principal)

  const { from, to, branchId, questionnaireId, page, pageSize } = query

  // 1. Fetch assigned employees (current state)
  const employees = await findActiveEmployeeAssignments(branchId)

  // 2. Fetch assigned questionnaires
  const questionnaires = await findAssignedQuestionnaires(branchId, questionnaireId)

  // 3. Build the assigned pairs: employees × questionnaires per branch
  const days = dateRange(from, to)
  const details: ComplianceDetailDTO[] = []

  for (const emp of employees) {
    // Questionnaires assigned to this employee's branch
    const empQuestionnaires = questionnaires.filter((q) => q.branchId === emp.branchId)
    for (const q of empQuestionnaires) {
      for (const day of days) {
        details.push({
          questionnaireId: q.questionnaireId,
          questionnaireTitle: q.title,
          branchId: emp.branchId,
          branchName: emp.branchName,
          employeeId: emp.userId,
          employeeName: `${emp.nombres} ${emp.apellidos}`,
          responded: false, // will be set below
          businessDay: day,
        })
      }
    }
  }

  // 4. Fetch responded keys for the range
  const userIds = [...new Set(employees.map((e) => e.userId))]
  const respondedKeys = userIds.length > 0
    ? await findRespondedKeys({
        from: toBusinessDayDate(from),
        to: toBusinessDayDate(to),
        questionnaireId,
        userIds,
      })
    : []

  // 5. Build responded set for O(1) lookup
  const respondedSet = new Set(
    respondedKeys.map(
      (r) => `${r.userId}|${r.questionnaireId}|${r.businessDay.toISOString().slice(0, 10)}`
    )
  )

  // 6. Mark responded details
  let respondedCount = 0
  for (const d of details) {
    const key = `${d.employeeId}|${d.questionnaireId}|${d.businessDay}`
    if (respondedSet.has(key)) {
      d.responded = true
      respondedCount++
    }
  }

  const totalAssigned = details.length
  const pendingCount = totalAssigned - respondedCount
  const complianceRate = totalAssigned > 0
    ? Math.round((respondedCount / totalAssigned) * 100) / 100
    : 0

  // 7. Paginate details
  const startIdx = (page - 1) * pageSize
  const paginatedItems = details.slice(startIdx, startIdx + pageSize)

  return {
    from,
    to,
    summary: {
      totalAssigned,
      responded: respondedCount,
      pending: pendingCount,
      complianceRate,
    },
    details: {
      items: paginatedItems,
      page,
      pageSize,
      total: totalAssigned,
    },
  }
}

// ---------------------------------------------------------------------------
// getPending
// ---------------------------------------------------------------------------

export async function getPending(
  principal: Principal,
  query: PendingQuery
): Promise<PendingReportDTO> {
  assertReportRole(principal)

  const { businessDay, branchId, questionnaireId } = query

  // 1. Fetch assigned employees and questionnaires
  const employees = await findActiveEmployeeAssignments(branchId)
  const questionnaires = await findAssignedQuestionnaires(branchId, questionnaireId)

  // 2. Build all assigned pairs for the single day
  interface AssignedPair {
    employeeId: string
    employeeName: string
    branchId: string
    branchName: string
    questionnaireId: string
    questionnaireTitle: string
  }
  const assignedPairs: AssignedPair[] = []

  for (const emp of employees) {
    const empQuestionnaires = questionnaires.filter((q) => q.branchId === emp.branchId)
    for (const q of empQuestionnaires) {
      assignedPairs.push({
        employeeId: emp.userId,
        employeeName: `${emp.nombres} ${emp.apellidos}`,
        branchId: emp.branchId,
        branchName: emp.branchName,
        questionnaireId: q.questionnaireId,
        questionnaireTitle: q.title,
      })
    }
  }

  // 3. Fetch responded keys for the single day
  const userIds = [...new Set(employees.map((e) => e.userId))]
  const bdDate = toBusinessDayDate(businessDay)
  const respondedKeys = userIds.length > 0
    ? await findRespondedKeys({ from: bdDate, to: bdDate, questionnaireId, userIds })
    : []

  const respondedSet = new Set(
    respondedKeys.map((r) => `${r.userId}|${r.questionnaireId}`)
  )

  // 4. Filter to pending only
  const pending: PendingEntryDTO[] = assignedPairs.filter(
    (p) => !respondedSet.has(`${p.employeeId}|${p.questionnaireId}`)
  )

  return { businessDay, pending }
}

// ---------------------------------------------------------------------------
// getHistory
// ---------------------------------------------------------------------------

export async function getHistory(
  principal: Principal,
  query: HistoryQuery
): Promise<HistoryReportDTO> {
  assertReportRole(principal)

  const { from, to, employeeId, questionnaireId, branchId, page, pageSize } = query

  const fromDate = toBusinessDayDate(from)
  const toDate = toBusinessDayDate(to)
  const skip = (page - 1) * pageSize

  const [rows, total] = await Promise.all([
    findHistoryPage({ from: fromDate, to: toDate, employeeId, questionnaireId, branchId }, skip, pageSize),
    countHistory({ from: fromDate, to: toDate, employeeId, questionnaireId, branchId }),
  ])

  const items: HistoryEntryDTO[] = rows.map((r) => ({
    id: r.id,
    employeeId: r.userId,
    employeeName: `${r.nombres} ${r.apellidos}`,
    questionnaireId: r.questionnaireId,
    questionnaireTitle: r.questionnaireTitle,
    versionId: r.versionId,
    versionNumber: r.versionNumber,
    businessDay: r.businessDay.toISOString().slice(0, 10),
    createdAt: r.createdAt.toISOString(),
    answers: r.answers.map((a) => ({
      questionId: a.questionId,
      prompt: a.question.prompt,
      type: a.question.type,
      value: a.value,
    })),
  }))

  return {
    from,
    to,
    results: {
      items,
      page,
      pageSize,
      total,
    },
  }
}
