import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { serializeQuestionDraftsForPatch } from '@/lib/operational-api/questionnaire-draft'
import type { QuestionDraft } from '@/lib/operational-api/questionnaire-draft'
import { QUESTION_TYPE } from '@/lib/types'

// Feature: operational-web-application, Property 3: Cuestionario consistente
// **Validates: Requirements 4.3**

const questionTypeArb = fc.constantFrom(...Object.values(QUESTION_TYPE))

// Alphabetic-only strings for prompts/config so they can never coincidentally
// contain a `clientKey` marker, keeping the leak assertion meaningful.
const safeStringArb = fc.stringMatching(/^[A-Za-z ]{0,40}$/)

const configValueArb = fc.oneof(
  safeStringArb,
  fc.integer({ min: -1_000, max: 1_000 }),
  fc.boolean(),
  fc.array(safeStringArb, { maxLength: 4 })
)

const configArb = fc.dictionary(
  fc.stringMatching(/^[a-z]{1,8}$/),
  configValueArb,
  { maxKeys: 5 }
)

// `clientKey` always carries the `CK#` marker (with `#`, absent from every
// other generated field) so we can assert it never leaks into the payload.
const draftArb: fc.Arbitrary<QuestionDraft> = fc.record({
  clientKey: fc.stringMatching(/^[0-9a-f]{1,12}$/).map((s) => `CK#${s}`),
  order: fc.integer({ min: -1_000, max: 1_000 }),
  type: questionTypeArb,
  prompt: safeStringArb,
  required: fc.boolean(),
  config: configArb,
})

// Bag key ignoring `order`: captures the type/config/prompt/required payload
// that must be preserved regardless of the normalized position.
function payloadKey(question: {
  type: string
  prompt: string
  required: boolean
  config: Record<string, unknown>
}): string {
  return JSON.stringify({
    type: question.type,
    prompt: question.prompt,
    required: question.required,
    config: question.config,
  })
}

describe('serializeQuestionDraftsForPatch consistency', () => {
  it('drops clientKey, yields unique positive 1..n orders, preserves type/config and sends the full set', () => {
    fc.assert(
      fc.property(
        fc.array(draftArb, { maxLength: 12 }),
        (drafts) => {
          const result = serializeQuestionDraftsForPatch(drafts)

          // Complete set: exactly one output question per input draft.
          expect(result.questions.length).toBe(drafts.length)

          // Orders are the contiguous sequence 1..n (positive and unique).
          const orders = result.questions.map((q) => q.order)
          expect(orders).toEqual(
            Array.from({ length: drafts.length }, (_, i) => i + 1)
          )

          // Type/config (and prompt/required) preserved as a multiset,
          // independent of normalized ordering.
          const inputBag = drafts.map(payloadKey).sort()
          const outputBag = result.questions.map(payloadKey).sort()
          expect(outputBag).toEqual(inputBag)

          // clientKey never leaks: not as a key, not anywhere in the payload.
          expect(
            result.questions.every(
              (q) => !Object.prototype.hasOwnProperty.call(q, 'clientKey')
            )
          ).toBe(true)
          const serialized = JSON.stringify(result)
          for (const draft of drafts) {
            expect(serialized.includes(draft.clientKey)).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
