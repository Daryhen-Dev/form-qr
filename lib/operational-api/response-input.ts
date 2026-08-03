import type {
  AnswerInput,
  BooleanAnswerInput,
  MultipleChoiceAnswerInput,
  NumericAnswerInput,
  SingleChoiceAnswerInput,
  TextAnswerInput,
} from '@/lib/operational-api/contracts'
import type { QuestionDTO, QuestionType, ResponseStatus } from '@/lib/types'
import { QUESTION_TYPE, RESPONSE_STATUS } from '@/lib/types'

/**
 * Response input helpers for the employee scan flow (Property 4).
 *
 * `buildAnswerInput` dispatches by question type to produce a typed
 * `AnswerInput` whose value respects the question type and configuration.
 * `resolveResponseAction` and `isUploadActive` derive the allowed mutation and
 * upload surface from the scan status so that `read_only` never enables writes.
 *
 * Pure validation is separated per question type: each type owns a small
 * builder that coerces the raw value into a valid, typed answer. The builders
 * are registered in a lookup table (`ANSWER_BUILDERS`) so the public dispatcher
 * stays declarative and the compiler enforces one builder per `QuestionType`.
 */

// ---------------------------------------------------------------------------
// Per-type value coercion (pure validation)
// ---------------------------------------------------------------------------

/** Extracts the configured option ids for choice-based questions. */
function optionIdsOf(question: QuestionDTO): readonly string[] {
  const options = (question.config as { options?: unknown }).options
  if (!Array.isArray(options)) {
    return []
  }

  return options
    .map((option) =>
      option && typeof option === 'object' && typeof (option as { id?: unknown }).id === 'string'
        ? ((option as { id: string }).id)
        : null
    )
    .filter((id): id is string => id !== null)
}

/** Reads the numeric scale bounds from the question configuration. */
function scaleBoundsOf(question: QuestionDTO): { min: number; max: number } {
  const config = question.config as { min?: unknown; max?: unknown }
  const min = typeof config.min === 'number' && Number.isFinite(config.min) ? config.min : 0
  const max = typeof config.max === 'number' && Number.isFinite(config.max) ? config.max : min
  return min <= max ? { min, max } : { min: max, max: min }
}

/** Clamps a raw value into the inclusive [min, max] range, defaulting to min. */
function clampToScale(rawValue: unknown, min: number, max: number): number {
  const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue)
  if (!Number.isFinite(numeric)) {
    return min
  }
  if (numeric < min) {
    return min
  }
  if (numeric > max) {
    return max
  }
  return numeric
}

/** Coerces a raw value into a finite number, defaulting to 0. */
function toFiniteNumber(rawValue: unknown): number {
  const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue)
  return Number.isFinite(numeric) ? numeric : 0
}

// ---------------------------------------------------------------------------
// Per-type answer builders
// ---------------------------------------------------------------------------

function buildBooleanAnswer(question: QuestionDTO, rawValue: unknown): BooleanAnswerInput {
  return { questionId: question.id, type: 'boolean', value: Boolean(rawValue) }
}

function buildSingleChoiceAnswer(
  question: QuestionDTO,
  rawValue: unknown
): SingleChoiceAnswerInput {
  const optionIds = optionIdsOf(question)
  const value =
    typeof rawValue === 'string' && optionIds.includes(rawValue)
      ? rawValue
      : (optionIds[0] ?? '')
  return { questionId: question.id, type: 'single_choice', value }
}

function buildMultipleChoiceAnswer(
  question: QuestionDTO,
  rawValue: unknown
): MultipleChoiceAnswerInput {
  const optionIds = optionIdsOf(question)
  const selection = Array.isArray(rawValue) ? rawValue : []
  const value = selection.filter(
    (candidate): candidate is string =>
      typeof candidate === 'string' && optionIds.includes(candidate)
  )
  return { questionId: question.id, type: 'multiple_choice', value }
}

function buildScaleAnswer(question: QuestionDTO, rawValue: unknown): NumericAnswerInput {
  const { min, max } = scaleBoundsOf(question)
  return { questionId: question.id, type: 'scale', value: clampToScale(rawValue, min, max) }
}

function buildNumberAnswer(question: QuestionDTO, rawValue: unknown): NumericAnswerInput {
  return { questionId: question.id, type: 'number', value: toFiniteNumber(rawValue) }
}

function buildTextAnswer(
  question: QuestionDTO,
  rawValue: unknown,
  type: TextAnswerInput['type']
): TextAnswerInput {
  const value = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '')
  return { questionId: question.id, type, value }
}

/** Builds a text-family answer whose `type` mirrors the question type. */
function buildTextAnswerFor(type: TextAnswerInput['type']) {
  return (question: QuestionDTO, rawValue: unknown): TextAnswerInput =>
    buildTextAnswer(question, rawValue, type)
}

// ---------------------------------------------------------------------------
// Type-driven dispatch
// ---------------------------------------------------------------------------

/** Coerces a question's raw value into its typed `AnswerInput`. */
type AnswerBuilder = (question: QuestionDTO, rawValue: unknown) => AnswerInput

/**
 * One builder per question type. Typing the map as `Record<QuestionType, …>`
 * makes the compiler reject any missing or unknown question type, replacing the
 * hand-written exhaustiveness guard.
 */
const ANSWER_BUILDERS: Record<QuestionType, AnswerBuilder> = {
  [QUESTION_TYPE.BOOLEAN]: buildBooleanAnswer,
  [QUESTION_TYPE.SINGLE_CHOICE]: buildSingleChoiceAnswer,
  [QUESTION_TYPE.MULTIPLE_CHOICE]: buildMultipleChoiceAnswer,
  [QUESTION_TYPE.SCALE]: buildScaleAnswer,
  [QUESTION_TYPE.NUMBER]: buildNumberAnswer,
  [QUESTION_TYPE.SHORT_TEXT]: buildTextAnswerFor(QUESTION_TYPE.SHORT_TEXT),
  [QUESTION_TYPE.LONG_TEXT]: buildTextAnswerFor(QUESTION_TYPE.LONG_TEXT),
  [QUESTION_TYPE.DATE]: buildTextAnswerFor(QUESTION_TYPE.DATE),
  [QUESTION_TYPE.TIME]: buildTextAnswerFor(QUESTION_TYPE.TIME),
  [QUESTION_TYPE.PHOTO]: buildTextAnswerFor(QUESTION_TYPE.PHOTO),
  [QUESTION_TYPE.FILE]: buildTextAnswerFor(QUESTION_TYPE.FILE),
}

/**
 * Builds a typed `AnswerInput` for a question, respecting its type and
 * configuration: choices stay within the configured options, scale values stay
 * within [min, max], numbers are finite, booleans/strings are coerced by type.
 */
export function buildAnswerInput(question: QuestionDTO, rawValue: unknown): AnswerInput {
  return ANSWER_BUILDERS[question.type](question, rawValue)
}

// ---------------------------------------------------------------------------
// Scan status → allowed surface
// ---------------------------------------------------------------------------

/** The mutation allowed by a scan status: none for read_only, create/update otherwise. */
export type ResponseAction = 'none' | 'create' | 'update'

/**
 * Resolves the mutation action allowed for a scan status.
 * `read_only` → 'none', `absent` → 'create', `editable` → 'update'.
 */
export function resolveResponseAction(status: ResponseStatus): ResponseAction {
  switch (status) {
    case RESPONSE_STATUS.ABSENT:
      return 'create'
    case RESPONSE_STATUS.EDITABLE:
      return 'update'
    case RESPONSE_STATUS.READ_ONLY:
      return 'none'
    default: {
      const exhaustiveCheck: never = status
      return exhaustiveCheck
    }
  }
}

/**
 * Whether file/photo uploads are active for a scan status.
 * `read_only` disables uploads; `absent`/`editable` keep them active.
 */
export function isUploadActive(status: ResponseStatus): boolean {
  return status !== RESPONSE_STATUS.READ_ONLY
}
