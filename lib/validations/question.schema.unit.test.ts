/**
 * Unit tests for question.schema — 11-type discriminated union validation.
 * TDD: RED phase — written before the schema implementation.
 * Run with: pnpm test --project unit
 *
 * Tasks covered: 4b.5 (valid + failure for each type), 4b.7 (duplicate order in batch)
 */
import { describe, expect, it } from 'vitest'
import { questionSchema, setQuestionsSchema } from './question.schema'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Wraps a question payload with the required base fields. */
function makeQuestion(overrides: Record<string, unknown>) {
  return {
    order: 1,
    prompt: 'Test question?',
    required: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 4b.5 — Valid parse for each of the 11 types
// ---------------------------------------------------------------------------

describe('questionSchema — valid parses for all 11 types', () => {
  it('boolean — empty config is valid', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'boolean', config: {} })
    )
    expect(result.success).toBe(true)
  })

  it('single_choice — at least 1 option', () => {
    const result = questionSchema.safeParse(
      makeQuestion({
        type: 'single_choice',
        config: { options: [{ id: 'o1', label: 'Option A' }] },
      })
    )
    expect(result.success).toBe(true)
  })

  it('multiple_choice — at least 1 option, with optional minSelected/maxSelected', () => {
    const result = questionSchema.safeParse(
      makeQuestion({
        type: 'multiple_choice',
        config: {
          options: [
            { id: 'o1', label: 'A' },
            { id: 'o2', label: 'B' },
          ],
          minSelected: 1,
          maxSelected: 2,
        },
      })
    )
    expect(result.success).toBe(true)
  })

  it('multiple_choice — options only, no min/max selected', () => {
    const result = questionSchema.safeParse(
      makeQuestion({
        type: 'multiple_choice',
        config: { options: [{ id: 'o1', label: 'A' }] },
      })
    )
    expect(result.success).toBe(true)
  })

  it('scale — min and max with step and labels', () => {
    const result = questionSchema.safeParse(
      makeQuestion({
        type: 'scale',
        config: { min: 1, max: 10, step: 1, labels: { '1': 'Low', '10': 'High' } },
      })
    )
    expect(result.success).toBe(true)
  })

  it('scale — min and max only (no step/labels)', () => {
    const result = questionSchema.safeParse(
      makeQuestion({
        type: 'scale',
        config: { min: 0, max: 5 },
      })
    )
    expect(result.success).toBe(true)
  })

  it('short_text — no required config', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'short_text', config: {} })
    )
    expect(result.success).toBe(true)
  })

  it('short_text — with optional maxLength', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'short_text', config: { maxLength: 255 } })
    )
    expect(result.success).toBe(true)
  })

  it('long_text — no required config', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'long_text', config: {} })
    )
    expect(result.success).toBe(true)
  })

  it('long_text — with optional maxLength', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'long_text', config: { maxLength: 2000 } })
    )
    expect(result.success).toBe(true)
  })

  it('number — no required config', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'number', config: {} })
    )
    expect(result.success).toBe(true)
  })

  it('number — with optional min/max', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'number', config: { min: 0, max: 100 } })
    )
    expect(result.success).toBe(true)
  })

  it('date — empty config is valid', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'date', config: {} })
    )
    expect(result.success).toBe(true)
  })

  it('time — empty config is valid', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'time', config: {} })
    )
    expect(result.success).toBe(true)
  })

  it('photo — with objectKeyPattern', () => {
    const result = questionSchema.safeParse(
      makeQuestion({
        type: 'photo',
        config: { objectKeyPattern: 'photos/{id}' },
      })
    )
    expect(result.success).toBe(true)
  })

  it('photo — with objectKeyPattern + optional fields', () => {
    const result = questionSchema.safeParse(
      makeQuestion({
        type: 'photo',
        config: {
          objectKeyPattern: 'photos/{id}',
          maxSizeBytes: 5_000_000,
          allowedMimeTypes: ['image/jpeg', 'image/png'],
        },
      })
    )
    expect(result.success).toBe(true)
  })

  it('file — with objectKeyPattern', () => {
    const result = questionSchema.safeParse(
      makeQuestion({
        type: 'file',
        config: { objectKeyPattern: 'files/{id}' },
      })
    )
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4b.5 — Failure cases
// ---------------------------------------------------------------------------

describe('questionSchema — failure cases', () => {
  it('single_choice — empty options array → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'single_choice', config: { options: [] } })
    )
    expect(result.success).toBe(false)
  })

  it('multiple_choice — empty options array → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'multiple_choice', config: { options: [] } })
    )
    expect(result.success).toBe(false)
  })

  it('scale — max <= min → fail (max must exceed min)', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'scale', config: { min: 5, max: 3 } })
    )
    expect(result.success).toBe(false)
  })

  it('scale — max === min → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'scale', config: { min: 5, max: 5 } })
    )
    expect(result.success).toBe(false)
  })

  it('negative order → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'boolean', config: {}, order: -1 })
    )
    expect(result.success).toBe(false)
  })

  it('order === 0 → fail (must be positive)', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'boolean', config: {}, order: 0 })
    )
    expect(result.success).toBe(false)
  })

  it('photo — missing objectKeyPattern → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'photo', config: {} })
    )
    expect(result.success).toBe(false)
  })

  it('file — missing objectKeyPattern → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'file', config: {} })
    )
    expect(result.success).toBe(false)
  })

  it('photo — empty objectKeyPattern → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'photo', config: { objectKeyPattern: '' } })
    )
    expect(result.success).toBe(false)
  })

  it('boolean — extra config field with strict() → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'boolean', config: { extraField: true } })
    )
    expect(result.success).toBe(false)
  })

  it('date — extra config field with strict() → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'date', config: { extraField: 'nope' } })
    )
    expect(result.success).toBe(false)
  })

  it('time — extra config field with strict() → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'time', config: { extraField: 'nope' } })
    )
    expect(result.success).toBe(false)
  })

  it('unknown type → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'unknown_type', config: {} })
    )
    expect(result.success).toBe(false)
  })

  it('missing prompt → fail', () => {
    const result = questionSchema.safeParse({
      order: 1,
      required: false,
      type: 'boolean',
      config: {},
    })
    expect(result.success).toBe(false)
  })

  it('empty prompt → fail', () => {
    const result = questionSchema.safeParse(
      makeQuestion({ type: 'boolean', config: {}, prompt: '' })
    )
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4b.7 — setQuestionsSchema: duplicate order in batch → fail
// ---------------------------------------------------------------------------

describe('setQuestionsSchema — in-batch order uniqueness', () => {
  it('unique orders in batch → valid', () => {
    const result = setQuestionsSchema.safeParse({
      questions: [
        makeQuestion({ type: 'boolean', config: {}, order: 1 }),
        makeQuestion({ type: 'short_text', config: {}, order: 2 }),
        makeQuestion({ type: 'number', config: {}, order: 3 }),
      ],
    })
    expect(result.success).toBe(true)
  })

  it('duplicate order in batch → fail with duplicate order issue', () => {
    const result = setQuestionsSchema.safeParse({
      questions: [
        makeQuestion({ type: 'boolean', config: {}, order: 1 }),
        makeQuestion({ type: 'short_text', config: {}, order: 1 }),
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const hasOrderIssue = result.error.issues.some(
        (issue) => issue.message === 'duplicate order'
      )
      expect(hasOrderIssue).toBe(true)
    }
  })

  it('three questions, last two share order → fail', () => {
    const result = setQuestionsSchema.safeParse({
      questions: [
        makeQuestion({ type: 'boolean', config: {}, order: 1 }),
        makeQuestion({ type: 'date', config: {}, order: 2 }),
        makeQuestion({ type: 'time', config: {}, order: 2 }),
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const hasOrderIssue = result.error.issues.some(
        (issue) => issue.message === 'duplicate order'
      )
      expect(hasOrderIssue).toBe(true)
    }
  })

  it('empty questions array → valid (no questions to conflict)', () => {
    const result = setQuestionsSchema.safeParse({ questions: [] })
    expect(result.success).toBe(true)
  })

  it('single question → valid', () => {
    const result = setQuestionsSchema.safeParse({
      questions: [makeQuestion({ type: 'boolean', config: {}, order: 1 })],
    })
    expect(result.success).toBe(true)
  })
})
