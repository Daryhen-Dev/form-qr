/**
 * Unit test for example.schema — RED phase.
 * No database required — runs in pure Node.js environment.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it } from 'vitest'
import { exampleSchema } from './example.schema'

describe('exampleSchema', () => {
  it('accepts a valid payload with ping: true', () => {
    const result = exampleSchema.safeParse({ ping: true })
    expect(result.success).toBe(true)
  })

  it('accepts a valid payload with ping: false', () => {
    const result = exampleSchema.safeParse({ ping: false })
    expect(result.success).toBe(true)
  })

  it('rejects a payload where ping is a string', () => {
    const result = exampleSchema.safeParse({ ping: 'bad' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0)
    }
  })

  it('rejects a payload where ping is missing', () => {
    const result = exampleSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects a payload where ping is a number', () => {
    const result = exampleSchema.safeParse({ ping: 1 })
    expect(result.success).toBe(false)
  })
})
