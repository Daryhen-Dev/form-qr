import 'server-only'
import { findByQrToken } from '@/lib/repositories/questionnaire.repository'
import { findActiveByUser } from '@/lib/repositories/branch-assignment.repository'
import { findByQuestionnaire as findQuestionnaireBranches } from '@/lib/repositories/questionnaire-branch.repository'
import { findById as findVersionById } from '@/lib/repositories/version.repository'
import { findByVersion as findQuestionsByVersion } from '@/lib/repositories/question.repository'
import { ServiceError } from '@/lib/services/auth.service'
import { RESPONSE_STATUS } from '@/lib/types'
import type { Principal, ScanResolutionDTO, QuestionnaireVersionDTO, QuestionDTO } from '@/lib/types'

// ---------------------------------------------------------------------------
// Internal mappers
// ---------------------------------------------------------------------------

function toVersionDTO(v: {
  id: string
  questionnaireId: string
  versionNumber: number
  status: string
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): QuestionnaireVersionDTO {
  return {
    id: v.id,
    questionnaireId: v.questionnaireId,
    versionNumber: v.versionNumber,
    status: v.status as QuestionnaireVersionDTO['status'],
    publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }
}

function toQuestionDTO(q: {
  id: string
  order: number
  type: string
  prompt: string
  required: boolean
  config: Record<string, unknown>
}): QuestionDTO {
  return {
    id: q.id,
    order: q.order,
    type: q.type as QuestionDTO['type'],
    prompt: q.prompt,
    required: q.required,
    config: q.config,
  }
}

// ---------------------------------------------------------------------------
// resolveScan — ordered validation gates per spec QR-02
// ---------------------------------------------------------------------------

/**
 * Resolves a QR scan for an Empleado.
 *
 * Ordered validation gates (short-circuit on first failure):
 *  1. Principal must be Empleado — else 403 (scan is the employee flow).
 *  2. Load questionnaire by qrToken — 404 if not found or soft-deleted.
 *  3. The employee's ACTIVE branch must have this questionnaire assigned — else 403.
 *  4. Resolve currentVersionId — 422 if no published version exists.
 *  5. Load the published version and its ordered questions.
 *  6. Report today's response status.
 *     NOTE: Response model arrives in Sub-PR 5b. In 5a, status is always 'absent'
 *     and response is always null. Real same-day lookup will be wired in 5b.
 *
 * @param principal Authenticated caller.
 * @param qrToken   The permanent token from the QR code.
 * @returns ScanResolutionDTO
 * @throws ServiceError(403) if caller is not Empleado or branch assignment is missing.
 * @throws ServiceError(404) if questionnaire is not found or soft-deleted.
 * @throws ServiceError(422) if the questionnaire has no published version.
 */
export async function resolveScan(
  principal: Principal,
  qrToken: string
): Promise<ScanResolutionDTO> {
  // Gate 1: only Empleado may scan (Administrador/Secretario use the QR management endpoint).
  if (principal.role !== 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  // Gate 2: load questionnaire by qrToken — 404 if absent or soft-deleted.
  const questionnaire = await findByQrToken(qrToken)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  // Gate 3a: the employee must have an active branch assignment.
  const activeAssignment = await findActiveByUser(principal.userId)
  if (!activeAssignment) {
    throw new ServiceError(403, 'no_active_branch')
  }

  // Gate 3b: the questionnaire must be assigned to the employee's active branch.
  const branchAssignments = await findQuestionnaireBranches(questionnaire.id)
  const isAssigned = branchAssignments.some(
    (a) => a.branchId === activeAssignment.branchId
  )
  if (!isAssigned) {
    throw new ServiceError(403, 'questionnaire_not_assigned')
  }

  // Gate 4: the questionnaire must have a current published version.
  if (!questionnaire.currentVersionId) {
    throw new ServiceError(422, 'no_published_version')
  }

  const version = await findVersionById(questionnaire.currentVersionId)
  if (!version) {
    // currentVersionId exists but the version row is missing — treat as 422.
    throw new ServiceError(422, 'no_published_version')
  }

  // Gate 5: load ordered questions for the published version.
  const questionRows = await findQuestionsByVersion(version.id)

  // Gate 6: determine today's response status.
  // TODO (5b): add real same-day lookup via response.repository.findByUserQuestionnaireDay.
  // In 5a the Response model does not exist yet; status is always 'absent'.
  const status = RESPONSE_STATUS.ABSENT

  return {
    questionnaireId: questionnaire.id,
    version: toVersionDTO(version),
    questions: questionRows.map(toQuestionDTO),
    status,
    response: null,
  }
}
