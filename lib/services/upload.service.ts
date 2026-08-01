import 'server-only'
import { findById as findQuestionnaire } from '@/lib/repositories/questionnaire.repository'
import { findActiveByUser } from '@/lib/repositories/branch-assignment.repository'
import { findByQuestionnaire as findQuestionnaireBranches } from '@/lib/repositories/questionnaire-branch.repository'
import { findById as findVersionById } from '@/lib/repositories/version.repository'
import { findByVersion as findQuestionsByVersion } from '@/lib/repositories/question.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { ServiceError } from '@/lib/services/auth.service'
import { generateUploadKey, createStorageService } from '@/lib/services/storage.service'
import type { Principal, PresignDTO } from '@/lib/types'
import type { PresignInput } from '@/lib/validations/response.schema'

// ---------------------------------------------------------------------------
// issuePresign
// ---------------------------------------------------------------------------

/**
 * Issues a presigned PUT URL for a photo/file question on a questionnaire
 * assigned to the calling Empleado's active branch.
 *
 * Ordered validation gates:
 *  1. Caller must be Empleado — else 403.
 *  2. Questionnaire must exist (active) — else 404.
 *  3. Employee must have an active branch — else 403.
 *  4. Questionnaire must be assigned to the employee's active branch — else 403.
 *  5. Questionnaire must have a published version — else 422.
 *  6. Resolve the question by questionId in that version — else 404.
 *  7. Question type must be 'photo' or 'file' — else 422 not_a_file_question.
 *  8. Validate mimeType against question config.allowedMimeTypes (if configured) — else 422.
 *  9. Validate sizeBytes against question config.maxSizeBytes (if configured) — else 422.
 * 10. Generate an owner-scoped key via generateUploadKey.
 * 11. Presign the PUT URL via storage.presignPutUrl.
 * 12. Optionally audit 'presign_issued'.
 * 13. Return PresignDTO { uploadUrl, objectKey }.
 *
 * @param principal Authenticated caller.
 * @param body      Validated presign body (from presignSchema.parse).
 * @returns PresignDTO with uploadUrl and objectKey.
 * @throws ServiceError on any validation failure.
 */
export async function issuePresign(
  principal: Principal,
  body: PresignInput
): Promise<PresignDTO> {
  // Gate 1: Empleado-only
  if (principal.role !== 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  // Gate 2: load questionnaire (active)
  const questionnaire = await findQuestionnaire(body.questionnaireId)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  // Gate 3: employee must have an active branch
  const activeAssignment = await findActiveByUser(principal.userId)
  if (!activeAssignment) {
    throw new ServiceError(403, 'no_active_branch')
  }

  // Gate 4: questionnaire must be assigned to the employee's active branch
  const branchAssignments = await findQuestionnaireBranches(questionnaire.id)
  const isAssigned = branchAssignments.some((a) => a.branchId === activeAssignment.branchId)
  if (!isAssigned) {
    throw new ServiceError(403, 'questionnaire_not_assigned')
  }

  // Gate 5: questionnaire must have a published version
  if (!questionnaire.currentVersionId) {
    throw new ServiceError(422, 'no_published_version')
  }

  const version = await findVersionById(questionnaire.currentVersionId)
  if (!version) {
    throw new ServiceError(422, 'no_published_version')
  }

  // Gate 6: resolve the question by questionId in the version
  const questions = await findQuestionsByVersion(version.id)
  const question = questions.find((q) => q.id === body.questionId)
  if (!question) {
    throw new ServiceError(404, 'question_not_found')
  }

  // Gate 7: question type must be 'photo' or 'file'
  if (question.type !== 'photo' && question.type !== 'file') {
    throw new ServiceError(422, 'not_a_file_question')
  }

  // Gate 8: validate mimeType against allowedMimeTypes (if configured)
  const config = question.config as { allowedMimeTypes?: string[]; maxSizeBytes?: number }
  if (config.allowedMimeTypes && config.allowedMimeTypes.length > 0) {
    if (!config.allowedMimeTypes.includes(body.mimeType)) {
      throw new ServiceError(422, 'mime_type_not_allowed')
    }
  }

  // Gate 9: validate sizeBytes against maxSizeBytes (if configured)
  if (typeof config.maxSizeBytes === 'number' && body.sizeBytes > config.maxSizeBytes) {
    throw new ServiceError(422, 'file_too_large')
  }

  // Gate 10: generate owner-scoped key
  const objectKey = generateUploadKey(
    questionnaire.id,
    version.id,
    body.questionId,
    principal.userId
  )

  // Gate 11: presign the PUT URL
  const storage = createStorageService()
  const uploadUrl = await storage.presignPutUrl(objectKey)

  // Gate 12: audit (optional per design — we record it for traceability)
  await auditRecord({
    action: 'presign_issued',
    entityType: 'Question',
    entityId: body.questionId,
    metadata: {
      issuedTo: principal.userId,
      questionnaireId: questionnaire.id,
      versionId: version.id,
      objectKey,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    },
  })

  // Gate 13: return PresignDTO
  return { uploadUrl, objectKey }
}
