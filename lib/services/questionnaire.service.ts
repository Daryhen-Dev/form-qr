import 'server-only'
import {
  create as repoCreate,
  findById,
  findAll,
  update as repoUpdate,
  softDelete as repoSoftDelete,
  setCurrentVersion,
} from '@/lib/repositories/questionnaire.repository'
import {
  createDraft,
  findById as findVersionById,
  listByQuestionnaire,
  nextVersionNumber,
  publish as repoPublish,
} from '@/lib/repositories/version.repository'
import { findByVersion, replaceForVersion } from '@/lib/repositories/question.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { ServiceError } from '@/lib/services/auth.service'
import type { Principal, QuestionnaireDTO, QuestionnaireVersionDTO, QuestionDTO } from '@/lib/types'
import type { CreateQuestionnaireInput, UpdateQuestionnaireInput } from '@/lib/validations/questionnaire.schema'
import type { SetQuestionsInput } from '@/lib/validations/question.schema'

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** Maps a raw DB questionnaire row to a safe QuestionnaireDTO. */
function toQuestionnaireDTO(q: {
  id: string
  title: string
  description: string | null
  currentVersionId: string | null
  createdAt: Date
  updatedAt: Date
}): QuestionnaireDTO {
  return {
    id: q.id,
    title: q.title,
    description: q.description,
    currentVersionId: q.currentVersionId,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  }
}

/** Maps a raw DB version row to a safe QuestionnaireVersionDTO. */
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

/** Maps a raw DB question row to a safe QuestionDTO. */
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
// Authorization helpers
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
// Immutability guard skeleton (wired to question mutations in 4b)
// ---------------------------------------------------------------------------

/**
 * Asserts that the given version is in draft status.
 * Throws ServiceError(409, 'version_immutable') if already published.
 * Called by question mutation operations (wired in 4b).
 */
export function assertDraftVersion(version: { status: string }): void {
  if (version.status === 'published') {
    throw new ServiceError(409, 'version_immutable')
  }
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a new questionnaire template.
 * Authorization: Administrador or Secretario only.
 * Writes an AuditLog row on success.
 */
export async function createTemplate(
  principal: Principal,
  dto: CreateQuestionnaireInput
): Promise<QuestionnaireDTO> {
  assertManagementRole(principal)

  const questionnaire = await repoCreate({
    title: dto.title,
    description: dto.description,
  })

  await auditRecord({
    action: 'CREATE',
    entityType: 'Questionnaire',
    entityId: questionnaire.id,
    metadata: { createdBy: principal.userId },
  })

  return toQuestionnaireDTO(questionnaire)
}

/**
 * Lists all active (non-deleted) questionnaire templates.
 * Authorization: Administrador or Secretario only.
 */
export async function listTemplates(principal: Principal): Promise<QuestionnaireDTO[]> {
  assertManagementRole(principal)

  const questionnaires = await findAll()
  return questionnaires.map(toQuestionnaireDTO)
}

/**
 * Gets a single active questionnaire template by ID.
 * Authorization: Administrador or Secretario only.
 * Throws ServiceError(404) if not found or soft-deleted.
 */
export async function getTemplate(
  principal: Principal,
  id: string
): Promise<QuestionnaireDTO> {
  assertManagementRole(principal)

  const questionnaire = await findById(id)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  return toQuestionnaireDTO(questionnaire)
}

/**
 * Updates allowed fields on an existing active questionnaire template.
 * Authorization: Administrador or Secretario only.
 * Throws ServiceError(404) if not found.
 * Writes an AuditLog row on success.
 */
export async function updateTemplate(
  principal: Principal,
  id: string,
  dto: UpdateQuestionnaireInput
): Promise<QuestionnaireDTO> {
  assertManagementRole(principal)

  const existing = await findById(id)
  if (!existing) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  const updated = await repoUpdate(id, dto)

  await auditRecord({
    action: 'UPDATE',
    entityType: 'Questionnaire',
    entityId: id,
    metadata: { updatedBy: principal.userId, fields: Object.keys(dto) },
  })

  return toQuestionnaireDTO(updated)
}

/**
 * Soft-deletes a questionnaire template (sets deletedAt = now).
 * Also clears the currentVersionId pointer.
 * Authorization: Administrador or Secretario only.
 * Throws ServiceError(404) if not found.
 * Writes an AuditLog row on success.
 */
export async function softDeleteTemplate(principal: Principal, id: string): Promise<void> {
  assertManagementRole(principal)

  const existing = await findById(id)
  if (!existing) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  // Clear the currentVersionId pointer first (FK constraint safety)
  if (existing.currentVersionId) {
    await setCurrentVersion(id, null)
  }

  await repoSoftDelete(id)

  await auditRecord({
    action: 'DELETE',
    entityType: 'Questionnaire',
    entityId: id,
    metadata: { deletedBy: principal.userId },
  })
}

// ---------------------------------------------------------------------------
// Version lifecycle
// ---------------------------------------------------------------------------

/**
 * Creates a new draft version for a questionnaire template.
 * Authorization: Administrador or Secretario only.
 * Throws ServiceError(404) if the template is not found.
 */
export async function createVersion(
  principal: Principal,
  questionnaireId: string
): Promise<QuestionnaireVersionDTO> {
  assertManagementRole(principal)

  const questionnaire = await findById(questionnaireId)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  const versionNumber = await nextVersionNumber(questionnaireId)
  const version = await createDraft(questionnaireId, versionNumber)

  return toVersionDTO(version)
}

/**
 * Lists all versions for a questionnaire template ordered by versionNumber ascending.
 * Authorization: Administrador or Secretario only.
 * Throws ServiceError(404) if the template is not found.
 */
export async function listVersions(
  principal: Principal,
  questionnaireId: string
): Promise<QuestionnaireVersionDTO[]> {
  assertManagementRole(principal)

  const questionnaire = await findById(questionnaireId)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  const versions = await listByQuestionnaire(questionnaireId)
  return versions.map(toVersionDTO)
}

/**
 * Gets a specific version with its ordered questions.
 * Authorization: Administrador or Secretario only.
 * Throws ServiceError(404) if the version is not found.
 */
export async function getVersion(
  principal: Principal,
  questionnaireId: string,
  versionId: string
): Promise<QuestionnaireVersionDTO & { questions: QuestionDTO[] }> {
  assertManagementRole(principal)

  const questionnaire = await findById(questionnaireId)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  const version = await findVersionById(versionId)
  if (!version || version.questionnaireId !== questionnaireId) {
    throw new ServiceError(404, 'version_not_found')
  }

  const questions = await findByVersion(versionId)

  return {
    ...toVersionDTO(version),
    questions: questions.map(toQuestionDTO),
  }
}

/**
 * Publishes a draft version, making it the current version for the template.
 * Sets status=published, publishedAt=now(), and Questionnaire.currentVersionId.
 * Writes an AuditLog row on success.
 *
 * Authorization: Administrador or Secretario only.
 * Throws ServiceError(404) if questionnaire or version is not found.
 * Throws ServiceError(409, 'version_already_published') if the version is already published.
 */
export async function publishVersion(
  principal: Principal,
  questionnaireId: string,
  versionId: string
): Promise<QuestionnaireVersionDTO> {
  assertManagementRole(principal)

  const questionnaire = await findById(questionnaireId)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  const version = await findVersionById(versionId)
  if (!version || version.questionnaireId !== questionnaireId) {
    throw new ServiceError(404, 'version_not_found')
  }

  // Idempotency guard: publishing an already-published version → 409
  if (version.status === 'published') {
    throw new ServiceError(409, 'version_already_published')
  }

  const published = await repoPublish(versionId)
  await setCurrentVersion(questionnaireId, versionId)

  await auditRecord({
    action: 'PUBLISH',
    entityType: 'QuestionnaireVersion',
    entityId: versionId,
    metadata: { publishedBy: principal.userId, questionnaireId },
  })

  return toVersionDTO(published)
}

// ---------------------------------------------------------------------------
// Question mutations (4b)
// ---------------------------------------------------------------------------

/**
 * Sets (replaces) the full ordered question set for a draft version.
 *
 * This is a replace-all operation: existing questions for the version are
 * deleted and the provided set is inserted atomically.
 *
 * Immutability guard: if the version is already published, throws
 * ServiceError(409, 'version_immutable'). Only draft versions may be mutated.
 *
 * Authorization: Administrador or Secretario only (Empleado → 403).
 * Writes an AuditLog row on success.
 *
 * @param principal      - The authenticated caller.
 * @param questionnaireId - The owning questionnaire template id.
 * @param versionId      - The version to set questions on.
 * @param input          - Validated input from setQuestionsSchema.
 * @returns The version DTO with the newly set questions ordered ascending.
 */
export async function setVersionQuestions(
  principal: Principal,
  questionnaireId: string,
  versionId: string,
  input: SetQuestionsInput
): Promise<QuestionnaireVersionDTO & { questions: QuestionDTO[] }> {
  assertManagementRole(principal)

  const questionnaire = await findById(questionnaireId)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  const version = await findVersionById(versionId)
  if (!version || version.questionnaireId !== questionnaireId) {
    throw new ServiceError(404, 'version_not_found')
  }

  // Immutability guard: published versions may not have their questions replaced
  assertDraftVersion(version)

  const newQuestions = await replaceForVersion(versionId, input.questions)

  await auditRecord({
    action: 'SET_QUESTIONS',
    entityType: 'QuestionnaireVersion',
    entityId: versionId,
    metadata: {
      setBy: principal.userId,
      questionnaireId,
      questionCount: newQuestions.length,
    },
  })

  return {
    ...toVersionDTO(version),
    questions: newQuestions.map(toQuestionDTO),
  }
}
