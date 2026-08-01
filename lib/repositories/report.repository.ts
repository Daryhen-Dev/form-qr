import 'server-only'
import { prisma } from '@/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmployeeAssignment {
  userId: string
  nombres: string
  apellidos: string
  branchId: string
  branchName: string
}

export interface AssignedQuestionnaire {
  questionnaireId: string
  title: string
  branchId: string
}

export interface RespondedKey {
  userId: string
  questionnaireId: string
  businessDay: Date
}

export interface HistoryRow {
  id: string
  questionnaireId: string
  questionnaireTitle: string
  versionId: string
  versionNumber: number
  userId: string
  nombres: string
  apellidos: string
  businessDay: Date
  createdAt: Date
  answers: Array<{
    questionId: string
    value: unknown
    question: { prompt: string; type: string }
  }>
}

// ---------------------------------------------------------------------------
// findActiveEmployeeAssignments
// ---------------------------------------------------------------------------

/**
 * Returns all Empleado users with an active branch assignment (unassignedAt IS NULL),
 * optionally filtered by branchId. Includes branch name for DTO enrichment.
 * READ-ONLY — no writes.
 */
export async function findActiveEmployeeAssignments(
  branchId?: string
): Promise<EmployeeAssignment[]> {
  const assignments = await prisma.branchAssignment.findMany({
    where: {
      unassignedAt: null,
      ...(branchId ? { branchId } : {}),
      user: { role: 'Empleado', deletedAt: null },
    },
    select: {
      userId: true,
      branchId: true,
      user: { select: { nombres: true, apellidos: true } },
      branch: { select: { name: true } },
    },
  })

  return assignments.map((a) => ({
    userId: a.userId,
    nombres: a.user.nombres,
    apellidos: a.user.apellidos,
    branchId: a.branchId,
    branchName: a.branch.name,
  }))
}

// ---------------------------------------------------------------------------
// findAssignedQuestionnaires
// ---------------------------------------------------------------------------

/**
 * Returns questionnaire-branch assignments for active (non-deleted) questionnaires,
 * optionally filtered by branchId and/or questionnaireId.
 * READ-ONLY — no writes.
 */
export async function findAssignedQuestionnaires(
  branchId?: string,
  questionnaireId?: string
): Promise<AssignedQuestionnaire[]> {
  const rows = await prisma.questionnaireBranch.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      ...(questionnaireId ? { questionnaireId } : {}),
      questionnaire: { deletedAt: null },
    },
    select: {
      questionnaireId: true,
      branchId: true,
      questionnaire: { select: { title: true } },
    },
  })

  return rows.map((r) => ({
    questionnaireId: r.questionnaireId,
    title: r.questionnaire.title,
    branchId: r.branchId,
  }))
}

// ---------------------------------------------------------------------------
// findRespondedKeys
// ---------------------------------------------------------------------------

/**
 * Returns the (userId, questionnaireId, businessDay) triplets for responses
 * within a date range, optionally filtered by questionnaireId and/or userIds.
 * Soft-deleted responses are excluded.
 * READ-ONLY — no writes.
 */
export async function findRespondedKeys(filters: {
  from: Date
  to: Date
  questionnaireId?: string
  userIds?: string[]
}): Promise<RespondedKey[]> {
  return prisma.response.findMany({
    where: {
      businessDay: { gte: filters.from, lte: filters.to },
      deletedAt: null,
      ...(filters.questionnaireId
        ? { questionnaireId: filters.questionnaireId }
        : {}),
      ...(filters.userIds ? { userId: { in: filters.userIds } } : {}),
    },
    select: {
      userId: true,
      questionnaireId: true,
      businessDay: true,
    },
  }) as Promise<RespondedKey[]>
}

// ---------------------------------------------------------------------------
// findHistoryPage + countHistory
// ---------------------------------------------------------------------------

/**
 * Returns a paginated set of response records enriched with version info,
 * employee names, questionnaire title, and answer questions (prompt + type).
 * Ordered by businessDay desc, createdAt desc.
 * READ-ONLY — no writes.
 */
export async function findHistoryPage(
  filters: {
    from: Date
    to: Date
    employeeId?: string
    questionnaireId?: string
    branchId?: string
  },
  skip: number,
  take: number
): Promise<HistoryRow[]> {
  // If branchId filter is set, we need to find employees currently in that branch
  let userIdFilter: string[] | undefined
  if (filters.branchId) {
    const assignments = await prisma.branchAssignment.findMany({
      where: { branchId: filters.branchId, unassignedAt: null },
      select: { userId: true },
    })
    userIdFilter = assignments.map((a) => a.userId)
    if (userIdFilter.length === 0) return []
  }

  const rows = await prisma.response.findMany({
    where: {
      businessDay: { gte: filters.from, lte: filters.to },
      deletedAt: null,
      ...(filters.questionnaireId
        ? { questionnaireId: filters.questionnaireId }
        : {}),
      ...(filters.employeeId ? { userId: filters.employeeId } : {}),
      ...(userIdFilter ? { userId: { in: userIdFilter } } : {}),
    },
    select: {
      id: true,
      questionnaireId: true,
      versionId: true,
      userId: true,
      businessDay: true,
      createdAt: true,
      questionnaire: { select: { title: true } },
      version: { select: { versionNumber: true } },
      user: { select: { nombres: true, apellidos: true } },
      answers: {
        select: {
          questionId: true,
          value: true,
          question: { select: { prompt: true, type: true } },
        },
      },
    },
    orderBy: [{ businessDay: 'desc' }, { createdAt: 'desc' }],
    skip,
    take,
  })

  return rows.map((r) => ({
    id: r.id,
    questionnaireId: r.questionnaireId,
    questionnaireTitle: r.questionnaire.title,
    versionId: r.versionId,
    versionNumber: r.version.versionNumber,
    userId: r.userId,
    nombres: r.user.nombres,
    apellidos: r.user.apellidos,
    businessDay: r.businessDay,
    createdAt: r.createdAt,
    answers: r.answers.map((a) => ({
      questionId: a.questionId,
      value: a.value,
      question: { prompt: a.question.prompt, type: a.question.type },
    })),
  }))
}

/**
 * Counts total response records matching the given filters.
 * Used for pagination metadata.
 * READ-ONLY — no writes.
 */
export async function countHistory(filters: {
  from: Date
  to: Date
  employeeId?: string
  questionnaireId?: string
  branchId?: string
}): Promise<number> {
  let userIdFilter: string[] | undefined
  if (filters.branchId) {
    const assignments = await prisma.branchAssignment.findMany({
      where: { branchId: filters.branchId, unassignedAt: null },
      select: { userId: true },
    })
    userIdFilter = assignments.map((a) => a.userId)
    if (userIdFilter.length === 0) return 0
  }

  return prisma.response.count({
    where: {
      businessDay: { gte: filters.from, lte: filters.to },
      deletedAt: null,
      ...(filters.questionnaireId
        ? { questionnaireId: filters.questionnaireId }
        : {}),
      ...(filters.employeeId ? { userId: filters.employeeId } : {}),
      ...(userIdFilter ? { userId: { in: userIdFilter } } : {}),
    },
  })
}
