/**
 * Unit tests for lib/validations/response.schema.ts
 *
 * Tests the 11-arm discriminated union for answer validation and the
 * createResponseSchema wrapper.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it } from 'vitest'
import { createResponseSchema } from './response.schema'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function buildBody(type: string, value: unknown) {
  return {
    questionnaireId: 'q_01',
    answers: [{ questionId: 'qn_01', type, value }],
  }
}

// ---------------------------------------------------------------------------
// Valid cases — each of the 11 question types
// ---------------------------------------------------------------------------

describe('createResponseSchema — valid answers per type', () => {
  it('boolean: true', () => {
    const r = createResponseSchema.safeParse(buildBody('boolean', true))
    expect(r.success).toBe(true)
  })

  it('boolean: false', () => {
    const r = createResponseSchema.safeParse(buildBody('boolean', false))
    expect(r.success).toBe(true)
  })

  it('single_choice: option id string', () => {
    const r = createResponseSchema.safeParse(buildBody('single_choice', 'opt_abc'))
    expect(r.success).toBe(true)
  })

  it('multiple_choice: array of option ids (min 1)', () => {
    const r = createResponseSchema.safeParse(buildBody('multiple_choice', ['opt_1', 'opt_2']))
    expect(r.success).toBe(true)
  })

  it('scale: integer', () => {
    const r = createResponseSchema.safeParse(buildBody('scale', 3))
    expect(r.success).toBe(true)
  })

  it('short_text: non-empty string', () => {
    const r = createResponseSchema.safeParse(buildBody('short_text', 'Some answer'))
    expect(r.success).toBe(true)
  })

  it('short_text: empty string (structurally valid; service does maxLength check)', () => {
    const r = createResponseSchema.safeParse(buildBody('short_text', ''))
    expect(r.success).toBe(true)
  })

  it('long_text: multi-line string', () => {
    const r = createResponseSchema.safeParse(buildBody('long_text', 'Line 1\nLine 2'))
    expect(r.success).toBe(true)
  })

  it('number: positive number', () => {
    const r = createResponseSchema.safeParse(buildBody('number', 42.5))
    expect(r.success).toBe(true)
  })

  it('number: zero', () => {
    const r = createResponseSchema.safeParse(buildBody('number', 0))
    expect(r.success).toBe(true)
  })

  it('number: negative number', () => {
    const r = createResponseSchema.safeParse(buildBody('number', -10))
    expect(r.success).toBe(true)
  })

  it('date: ISO date string', () => {
    const r = createResponseSchema.safeParse(buildBody('date', '2025-07-15'))
    expect(r.success).toBe(true)
  })

  it('time: HH:mm string', () => {
    const r = createResponseSchema.safeParse(buildBody('time', '08:30'))
    expect(r.success).toBe(true)
  })

  it('photo: server-issued object key (non-empty string)', () => {
    const r = createResponseSchema.safeParse(buildBody('photo', 'questionnaires/q_01/versions/v_01/questions/qn_01/emp_01/uuid.jpg'))
    expect(r.success).toBe(true)
  })

  it('file: server-issued object key (non-empty string)', () => {
    const r = createResponseSchema.safeParse(buildBody('file', 'questionnaires/q_01/versions/v_01/questions/qn_01/emp_01/doc.pdf'))
    expect(r.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Invalid cases — type mismatch for each arm
// ---------------------------------------------------------------------------

describe('createResponseSchema — type mismatch rejections', () => {
  it('boolean: string value → fails', () => {
    const r = createResponseSchema.safeParse(buildBody('boolean', 'yes'))
    expect(r.success).toBe(false)
  })

  it('boolean: number value → fails', () => {
    const r = createResponseSchema.safeParse(buildBody('boolean', 1))
    expect(r.success).toBe(false)
  })

  it('single_choice: boolean value → fails', () => {
    const r = createResponseSchema.safeParse(buildBody('single_choice', true))
    expect(r.success).toBe(false)
  })

  it('single_choice: empty string → fails (min(1))', () => {
    const r = createResponseSchema.safeParse(buildBody('single_choice', ''))
    expect(r.success).toBe(false)
  })

  it('multiple_choice: string instead of array → fails', () => {
    const r = createResponseSchema.safeParse(buildBody('multiple_choice', 'opt_1'))
    expect(r.success).toBe(false)
  })

  it('multiple_choice: empty array → fails (min(1))', () => {
    const r = createResponseSchema.safeParse(buildBody('multiple_choice', []))
    expect(r.success).toBe(false)
  })

  it('scale: non-integer float → fails', () => {
    const r = createResponseSchema.safeParse(buildBody('scale', 3.5))
    expect(r.success).toBe(false)
  })

  it('scale: string value → fails', () => {
    const r = createResponseSchema.safeParse(buildBody('scale', 'high'))
    expect(r.success).toBe(false)
  })

  it('number: string → fails', () => {
    const r = createResponseSchema.safeParse(buildBody('number', '42'))
    expect(r.success).toBe(false)
  })

  it('date: empty string → fails (min(1))', () => {
    const r = createResponseSchema.safeParse(buildBody('date', ''))
    expect(r.success).toBe(false)
  })

  it('time: empty string → fails (min(1))', () => {
    const r = createResponseSchema.safeParse(buildBody('time', ''))
    expect(r.success).toBe(false)
  })

  it('photo: empty string → fails (min(1))', () => {
    const r = createResponseSchema.safeParse(buildBody('photo', ''))
    expect(r.success).toBe(false)
  })

  it('file: empty string → fails (min(1))', () => {
    const r = createResponseSchema.safeParse(buildBody('file', ''))
    expect(r.success).toBe(false)
  })

  it('unknown type discriminant → fails', () => {
    const r = createResponseSchema.safeParse(buildBody('slider', 5))
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createResponseSchema — wrapper validations
// ---------------------------------------------------------------------------

describe('createResponseSchema — wrapper', () => {
  it('missing questionnaireId → fails', () => {
    const r = createResponseSchema.safeParse({ answers: [] })
    expect(r.success).toBe(false)
  })

  it('empty questionnaireId → fails (min(1))', () => {
    const r = createResponseSchema.safeParse({ questionnaireId: '', answers: [] })
    expect(r.success).toBe(false)
  })

  it('answers array missing → fails', () => {
    const r = createResponseSchema.safeParse({ questionnaireId: 'q_01' })
    expect(r.success).toBe(false)
  })

  it('empty answers array → succeeds (service validates required fields)', () => {
    const r = createResponseSchema.safeParse({ questionnaireId: 'q_01', answers: [] })
    expect(r.success).toBe(true)
  })

  it('multiple answers of mixed types → succeeds', () => {
    const r = createResponseSchema.safeParse({
      questionnaireId: 'q_01',
      answers: [
        { questionId: 'qn_01', type: 'boolean', value: true },
        { questionId: 'qn_02', type: 'scale', value: 4 },
        { questionId: 'qn_03', type: 'short_text', value: 'hello' },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('missing questionId on answer → fails', () => {
    const r = createResponseSchema.safeParse({
      questionnaireId: 'q_01',
      answers: [{ type: 'boolean', value: true }],
    })
    expect(r.success).toBe(false)
  })
})
