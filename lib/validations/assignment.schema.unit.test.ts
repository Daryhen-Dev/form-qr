/**
 * Unit tests for assignment.schema — validation rules.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it } from 'vitest'
import { assignSchema } from './assignment.schema'

describe('assignSchema', () => {
  it('accepts a valid payload with a non-empty userId', () => {
    const result = assignSchema.safeParse({ userId: 'user_abc123' })
    expect(result.success).toBe(true)
  })

  it('rejects when userId is missing', () => {
    const result = assignSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects when userId is an empty string', () => {
    const result = assignSchema.safeParse({ userId: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const userIdIssue = result.error.issues.find(i => i.path.includes('userId'))
      expect(userIdIssue).toBeDefined()
    }
  })

  it('accepts any non-empty string as userId (no format constraint)', () => {
    const result = assignSchema.safeParse({ userId: 'clabcdefg0000aaabbbccc111' })
    expect(result.success).toBe(true)
  })

  it('strips unknown fields', () => {
    const result = assignSchema.safeParse({ userId: 'user_01', extra: 'value' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra).toBeUndefined()
    }
  })
})
