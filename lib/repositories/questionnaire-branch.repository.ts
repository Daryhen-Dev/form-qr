import 'server-only'
import { prisma } from '@/lib/db'
import { ServiceError } from '@/lib/services/auth.service'

/** Shape of a questionnaire-branch assignment row as returned from the DB. */
export interface QuestionnaireBranchRow {
  id: string
  questionnaireId: string
  branchId: string
  assignedAt: Date
}

/** Returns true if err is a Prisma unique constraint violation (P2002). */
function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  )
}

/**
 * Assigns a questionnaire template to a branch.
 *
 * Catches Prisma P2002 (unique constraint on @@unique([questionnaireId, branchId]))
 * and re-throws as ServiceError(409, 'assignment_exists').
 */
export async function assign(
  questionnaireId: string,
  branchId: string
): Promise<QuestionnaireBranchRow> {
  try {
    return await prisma.questionnaireBranch.create({
      data: { questionnaireId, branchId },
    }) as QuestionnaireBranchRow
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ServiceError(409, 'assignment_exists')
    }
    throw err
  }
}

/**
 * Removes the assignment between a questionnaire template and a branch.
 * Throws ServiceError(404, 'assignment_not_found') if no matching row exists.
 */
export async function remove(
  questionnaireId: string,
  branchId: string
): Promise<void> {
  const existing = await prisma.questionnaireBranch.findFirst({
    where: { questionnaireId, branchId },
  })

  if (!existing) {
    throw new ServiceError(404, 'assignment_not_found')
  }

  await prisma.questionnaireBranch.delete({
    where: { id: existing.id },
  })
}

/**
 * Returns all branch assignments for a given questionnaire template,
 * ordered by assignedAt ascending.
 */
export async function findByQuestionnaire(
  questionnaireId: string
): Promise<QuestionnaireBranchRow[]> {
  return prisma.questionnaireBranch.findMany({
    where: { questionnaireId },
    orderBy: { assignedAt: 'asc' },
  }) as Promise<QuestionnaireBranchRow[]>
}

/**
 * Returns all questionnaire template assignments for a given branch,
 * ordered by assignedAt ascending.
 */
export async function findByBranch(branchId: string): Promise<QuestionnaireBranchRow[]> {
  return prisma.questionnaireBranch.findMany({
    where: { branchId },
    orderBy: { assignedAt: 'asc' },
  }) as Promise<QuestionnaireBranchRow[]>
}
