import 'server-only'
import { findById as findQuestionnaire } from '@/lib/repositories/questionnaire.repository'
import { findActiveByUser } from '@/lib/repositories/branch-assignment.repository'
import { findByQuestionnaire as findQuestionnaireBranches } from '@/lib/repositories/questionnaire-branch.repository'
import { findById as findVersionById } from '@/lib/repositories/version.repository'
import { findByVersion as findQuestionsByVersion } from '@/lib/repositories/question.repository'
import {
  createWithAnswers,
} from '@/lib/repositories/response.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { ServiceError } from '@/lib/services/auth.service'
import { utcToBusinessDay, businessDayWindowUtc } from '@/lib/utils/business-tz'
import { RESPONSE_STATUS } from '@/lib/types'
import type { Principal, ResponseDTO, AnswerDTO } from '@/lib/types'
import type { CreateResponseInput, AnswerInput } from '@/lib/validations/response.schema'
import type { QuestionRow } from '@/lib/repositories/question.repository'

// ---------------------------------------------------------------------------
// Internal mappers
// ---------------------------------------------------------------------------

function toAnswerDTO(a: { questionId: string; value: unknown }): AnswerDTO {
  return { questionId: a.questionId, value: a.value }
}

function toResponseDTO(
  row: {
    id: string
    questionnaireId: string
    versionId: string
    userId: string
    businessDay: Date
    createdAt: Date
    submittedAt: Date | null
    updatedAt: Date
    answers?: Array<{ questionId: string; value: unknown }>
  },
  status: ResponseDTO['status']
): ResponseDTO {
  return {
    id: row.id,
    questionnaireId: row.questionnaireId,
    versionId: row.versionId,
    businessDay: row.businessDay.toISOString().slice(0, 10), // DATE → 'YYYY-MM-DD'
    status,
    answers: (row.answers ?? []).map(toAnswerDTO),
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// validateAnswersAgainstVersion
// ---------------------------------------------------------------------------

/**
 * Service-level config validation — asserts that answers are consistent with
 * the version's question config (option ids, bounds, required presence).
 *
 * This is SEPARATE from structural Zod validation (which happens at the handler
 * boundary). This layer validates semantic correctness against the version
 * snapshot:
 *
 *   - required questions must have an answer
 *   - single_choice / multiple_choice: option id(s) must exist in config.options
 *   - scale: value must be within [config.min, config.max]
 *   - number: value must be within [config.min, config.max] if set
 *   - photo / file: value must be a non-empty string (key-prefix ownership checked in 5d)
 *
 * @throws ServiceError(422) on any config violation.
 */
function validateAnswersAgainstVersion(
  questions: QuestionRow[],
  answers: AnswerInput[]
): void {
  const answersByQuestionId = new Map<string, AnswerInput>()
  for (const a of answers) {
    answersByQuestionId.set(a.questionId, a)
  }

  for (const question of questions) {
    const answer = answersByQuestionId.get(question.id)

    // Required check
    if (question.required && answer === undefined) {
      throw new ServiceError(422, `required_answer_missing:${question.id}`)
    }

    if (answer === undefined) continue

    const cfg = question.config

    switch (question.type) {
      case 'single_choice': {
        // value is already validated as string (non-empty) by Zod
        const options = (cfg as { options?: Array<{ id: string }> }).options ?? []
        const validIds = new Set(options.map((o) => o.id))
        if (!validIds.has(answer.value as string)) {
          throw new ServiceError(422, `invalid_option_id:${question.id}`)
        }
        break
      }

      case 'multiple_choice': {
        // value is already validated as string[] min(1) by Zod
        const options = (cfg as { options?: Array<{ id: string }> }).options ?? []
        const validIds = new Set(options.map((o) => o.id))
        for (const selectedId of answer.value as string[]) {
          if (!validIds.has(selectedId)) {
            throw new ServiceError(422, `invalid_option_id:${question.id}`)
          }
        }
        break
      }

      case 'scale': {
        // value is already validated as integer by Zod
        const min = typeof cfg.min === 'number' ? cfg.min : null
        const max = typeof cfg.max === 'number' ? cfg.max : null
        const val = answer.value as number
        if (min !== null && val < min) {
          throw new ServiceError(422, `scale_out_of_range:${question.id}`)
        }
        if (max !== null && val > max) {
          throw new ServiceError(422, `scale_out_of_range:${question.id}`)
        }
        break
      }

      case 'number': {
        // value is already validated as number by Zod
        const min = typeof cfg.min === 'number' ? cfg.min : null
        const max = typeof cfg.max === 'number' ? cfg.max : null
        const val = answer.value as number
        if (min !== null && val < min) {
          throw new ServiceError(422, `number_out_of_range:${question.id}`)
        }
        if (max !== null && val > max) {
          throw new ServiceError(422, `number_out_of_range:${question.id}`)
        }
        break
      }

      case 'photo':
      case 'file': {
        // value is already validated as non-empty string by Zod
        // TODO (5d): assert value startsWith the owner-scoped key prefix
        // For 5b, any non-empty string is accepted (key-prefix ownership check arrives in 5d)
        break
      }

      // boolean, short_text, long_text, date, time: no additional config checks needed here
      default:
        break
    }
  }
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

/**
 * Creates a new daily response with answers for the calling Empleado.
 *
 * Ordered validation gates:
 *  1. Caller must be Empleado — else 403.
 *  2. Questionnaire must exist (findById, active) — else 404.
 *  3. Employee must have an active branch — else 403.
 *  4. Questionnaire must be assigned to the employee's active branch — else 403.
 *  5. Questionnaire must have a published version (currentVersionId set) — else 422.
 *  6. Compute today's businessDay via utcToBusinessDay(new Date()).
 *  7. Load version questions; run validateAnswersAgainstVersion — else 422.
 *  8. createWithAnswers atomically — P2002 → 409 (one-per-day backstop).
 *  9. Write AuditLog with action 'response_created'.
 * 10. Return ResponseDTO with status derived from businessDayWindowUtc.
 *
 * @param principal Authenticated caller.
 * @param body      Validated create-response body (from createResponseSchema.parse).
 * @returns ResponseDTO with editable/read_only status.
 * @throws ServiceError on any validation failure.
 */
export async function create(
  principal: Principal,
  body: CreateResponseInput
): Promise<ResponseDTO> {
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

  // Gate 6: derive today's business day (UTC-5, no DST)
  const now = new Date()
  const businessDayStr = utcToBusinessDay(now)
  // Parse as UTC midnight of that date for the @db.Date column
  const businessDay = new Date(`${businessDayStr}T00:00:00.000Z`)

  // Gate 7: load questions and run service-level config validation
  const questions = await findQuestionsByVersion(version.id)
  validateAnswersAgainstVersion(questions, body.answers)

  // Gate 8: create atomically (P2002 → ServiceError(409) from repo)
  const responseRow = await createWithAnswers(
    {
      questionnaireId: questionnaire.id,
      versionId: version.id,
      userId: principal.userId,
      businessDay,
    },
    body.answers.map((a) => ({ questionId: a.questionId, value: a.value }))
  )

  // Gate 9: audit
  await auditRecord({
    action: 'response_created',
    entityType: 'Response',
    entityId: responseRow.id,
    metadata: {
      createdBy: principal.userId,
      questionnaireId: questionnaire.id,
      versionId: version.id,
      businessDay: businessDayStr,
    },
  })

  // Gate 10: derive status from businessDayWindowUtc
  const { endUtc } = businessDayWindowUtc(businessDayStr)
  const status = now.getTime() <= endUtc.getTime()
    ? RESPONSE_STATUS.EDITABLE
    : RESPONSE_STATUS.READ_ONLY

  // Attach answers to the row for the DTO (repo returns row without answers on create)
  const rowWithAnswers = {
    ...responseRow,
    answers: body.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
  }

  return toResponseDTO(rowWithAnswers, status)
}
