import type { QuestionInput, SetQuestionsRequest } from '@/lib/operational-api/contracts'
import type { QuestionDraft } from '@/lib/operational-api/questionnaire-draft'

/**
 * Pure serialization for questionnaire drafts.
 *
 * This module isolates the side-effect-free transformation that turns an
 * in-memory draft set into the exact body the PATCH contract expects. Keeping
 * it separate from the draft model makes each step independently testable and
 * reusable, without any coupling to React state or the API client.
 */

/**
 * Sorts drafts by their current `order` (ties preserve original position) and
 * reassigns contiguous 1..n orders. Pure and side-effect free.
 */
export function normalizeQuestionOrders(
  drafts: readonly QuestionDraft[]
): readonly QuestionDraft[] {
  return drafts
    .map((draft, index) => ({ draft, index }))
    .sort((a, b) => a.draft.order - b.draft.order || a.index - b.index)
    .map(({ draft }, position) => ({ ...draft, order: position + 1 }))
}

/**
 * Projects a draft onto the API `QuestionInput` shape, dropping `clientKey` and
 * emitting only the fields the PATCH contract allows.
 */
export function toQuestionInput(draft: QuestionDraft): QuestionInput {
  return {
    order: draft.order,
    type: draft.type,
    prompt: draft.prompt,
    required: draft.required,
    config: draft.config,
  }
}

/**
 * Assembles the full ordered draft set into the `SetQuestionsRequest` body.
 *
 * Guarantees, for any input:
 * - `clientKey` never leaks into the payload.
 * - Orders are the contiguous sequence 1..n (positive and unique).
 * - Every draft is included exactly once, preserving its type and config.
 */
export function serializeDraftsToSetQuestionsRequest(
  drafts: readonly QuestionDraft[]
): SetQuestionsRequest {
  return {
    questions: normalizeQuestionOrders(drafts).map(toQuestionInput),
  }
}
