import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { QuestionDTO } from '@/lib/operational-api/contracts'
// Target module for GREEN task 5.3 — intentionally does not exist yet (RED).
import {
  buildAnswerInput,
  isUploadActive,
  resolveResponseAction,
} from '@/lib/operational-api/response-input'
import { QUESTION_TYPE, RESPONSE_STATUS } from '@/lib/types'
import type { QuestionType, ResponseStatus } from '@/lib/types'

// Feature: operational-web-application, Property 4: Respuesta dinámica segura
// **Validates: Requirements 5.2, 5.3, 5.4, 5.5**

type ExpectedValueKind = 'boolean' | 'string' | 'number' | 'string[]'

interface QuestionCase {
  readonly question: QuestionDTO
  readonly rawValue: unknown
  readonly expected: ExpectedValueKind
  readonly optionIds?: readonly string[]
  readonly scaleBounds?: { readonly min: number; readonly max: number }
}

const idArb = fc.stringMatching(/^q-[a-z0-9]{1,12}$/)
const promptArb = fc.string({ minLength: 1, maxLength: 40 })
const orderArb = fc.integer({ min: 1, max: 50 })
const optionIdsArb = fc.uniqueArray(fc.stringMatching(/^opt-[a-z0-9]{1,8}$/), {
  minLength: 1,
  maxLength: 6,
})

function baseQuestionArb(
  type: QuestionType,
  config: Record<string, unknown>
): fc.Arbitrary<QuestionDTO> {
  return fc
    .record({ id: idArb, order: orderArb, prompt: promptArb, required: fc.boolean() })
    .map(({ id, order, prompt, required }) => ({
      id,
      order,
      type,
      prompt,
      required,
      config,
    }))
}

const booleanCaseArb: fc.Arbitrary<QuestionCase> = fc
  .record({ question: baseQuestionArb(QUESTION_TYPE.BOOLEAN, {}), rawValue: fc.boolean() })
  .map(({ question, rawValue }) => ({ question, rawValue, expected: 'boolean' as const }))

const singleChoiceCaseArb: fc.Arbitrary<QuestionCase> = optionIdsArb.chain((optionIds) =>
  fc
    .record({
      question: baseQuestionArb(QUESTION_TYPE.SINGLE_CHOICE, {
        options: optionIds.map((id) => ({ id, label: id })),
      }),
      rawValue: fc.constantFrom(...optionIds),
    })
    .map(({ question, rawValue }) => ({
      question,
      rawValue,
      expected: 'string' as const,
      optionIds,
    }))
)

const multipleChoiceCaseArb: fc.Arbitrary<QuestionCase> = optionIdsArb.chain((optionIds) =>
  fc
    .record({
      question: baseQuestionArb(QUESTION_TYPE.MULTIPLE_CHOICE, {
        options: optionIds.map((id) => ({ id, label: id })),
      }),
      rawValue: fc.subarray(optionIds),
    })
    .map(({ question, rawValue }) => ({
      question,
      rawValue,
      expected: 'string[]' as const,
      optionIds,
    }))
)

const scaleCaseArb: fc.Arbitrary<QuestionCase> = fc
  .tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 6, max: 10 }))
  .chain(([min, max]) =>
    fc
      .record({
        question: baseQuestionArb(QUESTION_TYPE.SCALE, { min, max }),
        rawValue: fc.integer({ min, max }),
      })
      .map(({ question, rawValue }) => ({
        question,
        rawValue,
        expected: 'number' as const,
        scaleBounds: { min, max },
      }))
  )

const numberCaseArb: fc.Arbitrary<QuestionCase> = fc
  .record({
    question: baseQuestionArb(QUESTION_TYPE.NUMBER, {}),
    rawValue: fc.integer({ min: -10_000, max: 10_000 }),
  })
  .map(({ question, rawValue }) => ({ question, rawValue, expected: 'number' as const }))

const TEXT_TYPES: readonly QuestionType[] = [
  QUESTION_TYPE.SHORT_TEXT,
  QUESTION_TYPE.LONG_TEXT,
  QUESTION_TYPE.DATE,
  QUESTION_TYPE.TIME,
  QUESTION_TYPE.PHOTO,
  QUESTION_TYPE.FILE,
]

const textCaseArb: fc.Arbitrary<QuestionCase> = fc.constantFrom(...TEXT_TYPES).chain((type) =>
  fc
    .record({
      question: baseQuestionArb(type, {}),
      rawValue: fc.string({ minLength: 1, maxLength: 60 }),
    })
    .map(({ question, rawValue }) => ({ question, rawValue, expected: 'string' as const }))
)

const questionCaseArb: fc.Arbitrary<QuestionCase> = fc.oneof(
  booleanCaseArb,
  singleChoiceCaseArb,
  multipleChoiceCaseArb,
  scaleCaseArb,
  numberCaseArb,
  textCaseArb
)

const responseStatusArb = fc.constantFrom<ResponseStatus>(
  RESPONSE_STATUS.ABSENT,
  RESPONSE_STATUS.EDITABLE,
  RESPONSE_STATUS.READ_ONLY
)

describe('Property 4: Respuesta dinámica segura', () => {
  it('builds a typed AnswerInput that respects the question type and configuration', () => {
    fc.assert(
      fc.property(questionCaseArb, ({ question, rawValue, expected, optionIds, scaleBounds }) => {
        const answer = buildAnswerInput(question, rawValue)

        expect(answer.questionId).toBe(question.id)
        expect(answer.type).toBe(question.type)

        switch (expected) {
          case 'boolean':
            expect(typeof answer.value).toBe('boolean')
            break
          case 'string':
            expect(typeof answer.value).toBe('string')
            break
          case 'number':
            expect(typeof answer.value).toBe('number')
            expect(Number.isFinite(answer.value as number)).toBe(true)
            break
          case 'string[]':
            expect(Array.isArray(answer.value)).toBe(true)
            break
        }

        if (question.type === QUESTION_TYPE.SINGLE_CHOICE) {
          expect(optionIds).toContain(answer.value as string)
        }

        if (question.type === QUESTION_TYPE.MULTIPLE_CHOICE) {
          for (const selected of answer.value as string[]) {
            expect(optionIds).toContain(selected)
          }
        }

        if (scaleBounds) {
          const numeric = answer.value as number
          expect(numeric).toBeGreaterThanOrEqual(scaleBounds.min)
          expect(numeric).toBeLessThanOrEqual(scaleBounds.max)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('keeps no mutation or upload active for a read_only scan', () => {
    fc.assert(
      fc.property(responseStatusArb, (status) => {
        const action = resolveResponseAction(status)
        const uploadActive = isUploadActive(status)

        if (status === RESPONSE_STATUS.READ_ONLY) {
          expect(action).toBe('none')
          expect(uploadActive).toBe(false)
        } else if (status === RESPONSE_STATUS.ABSENT) {
          expect(action).toBe('create')
          expect(uploadActive).toBe(true)
        } else {
          expect(action).toBe('update')
          expect(uploadActive).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })
})
