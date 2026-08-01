import 'server-only'
import {
  assign as repoAssign,
  remove as repoRemove,
  findByQuestionnaire,
  findByBranch,
} from '@/lib/repositories/questionnaire-branch.repository'
import { findById as findQuestionnaire } from '@/lib/repositories/questionnaire.repository'
import { findById as findBranch } from '@/lib/repositories/branch.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { ServiceError } from '@/lib/services/auth.service'
import type { Principal, QuestionnaireBranchDTO } from '@/lib/types'

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/** Maps a raw DB questionnaire-branch row to a safe QuestionnaireBranchDTO. */
function toQuestionnaireBranchDTO(row: {
  id: string
  questionnaireId: string
  branchId: string
  assignedAt: Date
}): QuestionnaireBranchDTO {
  return {
    id: row.id,
    questionnaireId: row.questionnaireId,
    branchId: row.branchId,
    assignedAt: row.assignedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Authorization helper
// ---------------------------------------------------------------------------

/**
 * Asserts that the principal has Administrador or Secretario role.
 * Throws ServiceError(403) for Empleado.
 */
function assertManagementRole(principal: Principal): void {
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Assigns a questionnaire template to a branch.
 *
 * Authorization: Administrador or Secretario only (Empleado → 403).
 * Verifies:
 *  - Questionnaire exists and is active (→ 404 'questionnaire_not_found').
 *  - Branch exists (→ 404 'branch_not_found'); if soft-deleted (→ 422 'branch_inactive').
 * Duplicate assignment → 409 (P2002 backstop via @@unique).
 * Writes an AuditLog row on success.
 */
export async function assignBranch(
  principal: Principal,
  questionnaireId: string,
  branchId: string
): Promise<QuestionnaireBranchDTO> {
  assertManagementRole(principal)

  // Verify questionnaire exists and is active
  const questionnaire = await findQuestionnaire(questionnaireId)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  // Verify branch — findById returns null for both missing AND soft-deleted branches.
  // We need to distinguish: look up without the deletedAt filter to detect inactive.
  const branch = await findBranch(branchId)
  if (!branch) {
    // Could be missing or soft-deleted — call lower-level Prisma via branch repo?
    // branch.repository.findById already filters deletedAt:null.
    // To surface 422 for inactive vs 404 for missing, do a raw check:
    const { prisma } = await import('@/lib/db')
    const rawBranch = await prisma.branch.findUnique({ where: { id: branchId } })
    if (!rawBranch) {
      throw new ServiceError(404, 'branch_not_found')
    }
    // rawBranch exists but findById returned null → it's soft-deleted
    throw new ServiceError(422, 'branch_inactive')
  }

  const assignment = await repoAssign(questionnaireId, branchId)

  await auditRecord({
    action: 'ASSIGN',
    entityType: 'QuestionnaireBranch',
    entityId: assignment.id,
    metadata: {
      assignedBy: principal.userId,
      questionnaireId,
      branchId,
    },
  })

  return toQuestionnaireBranchDTO(assignment)
}

/**
 * Removes the assignment between a questionnaire template and a branch.
 *
 * Authorization: Administrador or Secretario only (Empleado → 403).
 * Throws ServiceError(404, 'assignment_not_found') if the assignment does not exist.
 * Writes an AuditLog row on success.
 */
export async function unassignBranch(
  principal: Principal,
  questionnaireId: string,
  branchId: string
): Promise<void> {
  assertManagementRole(principal)

  // repoRemove throws ServiceError(404) if not found
  await repoRemove(questionnaireId, branchId)

  await auditRecord({
    action: 'UNASSIGN',
    entityType: 'QuestionnaireBranch',
    entityId: `${questionnaireId}:${branchId}`,
    metadata: {
      unassignedBy: principal.userId,
      questionnaireId,
      branchId,
    },
  })
}

/**
 * Lists all branches assigned to a questionnaire template.
 *
 * Authorization: Administrador or Secretario only (Empleado → 403).
 * Throws ServiceError(404, 'questionnaire_not_found') if the template does not exist.
 */
export async function listBranchesForTemplate(
  principal: Principal,
  questionnaireId: string
): Promise<QuestionnaireBranchDTO[]> {
  assertManagementRole(principal)

  const questionnaire = await findQuestionnaire(questionnaireId)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  const assignments = await findByQuestionnaire(questionnaireId)
  return assignments.map(toQuestionnaireBranchDTO)
}

/**
 * Lists all questionnaire templates assigned to a branch.
 *
 * Authorization: Administrador or Secretario only (Empleado → 403).
 * Note: /api/v1/branches/:branchId/questionnaires — service enforces role.
 */
export async function listTemplatesForBranch(
  principal: Principal,
  branchId: string
): Promise<QuestionnaireBranchDTO[]> {
  assertManagementRole(principal)

  const assignments = await findByBranch(branchId)
  return assignments.map(toQuestionnaireBranchDTO)
}
