import type { SetQuestionsRequest } from '@/lib/operational-api/contracts'
import { serializeDraftsToSetQuestionsRequest } from '@/lib/operational-api/questionnaire-draft-serialization'
import type { QuestionType } from '@/lib/types'

/**
 * In-memory draft of a single question while a draft version is being edited.
 *
 * `clientKey` is a UI-only stable identity used to track a question across
 * reorders and edits before it is persisted. It is NEVER sent to the API: the
 * PATCH contract identifies questions positionally by `order`, so `clientKey`
 * is stripped during serialization.
 */
export interface QuestionDraft {
  readonly clientKey: string
  readonly order: number
  readonly type: QuestionType
  readonly prompt: string
  readonly required: boolean
  readonly config: Record<string, unknown>
}

/**
 * Serializes the full ordered draft set into the body expected by
 * `PATCH /api/v1/questionnaires/:id/versions/:versionId`.
 *
 * The pure serialization is delegated to
 * `questionnaire-draft-serialization.ts`, keeping this module focused on the
 * draft model and its public contract. Behavior and output are unchanged:
 * - `clientKey` never leaks into the payload.
 * - Orders are the contiguous sequence 1..n (positive and unique).
 * - Every draft is included exactly once, preserving its type and config.
 */
export function serializeQuestionDraftsForPatch(
  drafts: readonly QuestionDraft[]
): SetQuestionsRequest {
  return serializeDraftsToSetQuestionsRequest(drafts)
}
