/**
 * Unit tests for branch.schema — validation rules.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it } from 'vitest'
import { createBranchSchema, updateBranchSchema } from './branch.schema'

describe('createBranchSchema', () => {
  it('accepts a valid payload with required name', () => {
    const result = createBranchSchema.safeParse({ name: 'Main Branch' })
    expect(result.success).toBe(true)
  })

  it('accepts a valid payload with all optional fields', () => {
    const result = createBranchSchema.safeParse({
      name: 'Main Branch',
      code: 'MB-01',
      address: '123 Main St',
    })
    expect(result.success).toBe(true)
  })

  it('rejects when name is missing', () => {
    const result = createBranchSchema.safeParse({ code: 'MB-01' })
    expect(result.success).toBe(false)
  })

  it('rejects when name is an empty string', () => {
    const result = createBranchSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const nameIssue = result.error.issues.find(i => i.path.includes('name'))
      expect(nameIssue).toBeDefined()
    }
  })

  it('accepts when code is omitted (optional)', () => {
    const result = createBranchSchema.safeParse({ name: 'Branch X' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.code).toBeUndefined()
    }
  })

  it('accepts when address is omitted (optional)', () => {
    const result = createBranchSchema.safeParse({ name: 'Branch X' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.address).toBeUndefined()
    }
  })

  it('strips unknown fields', () => {
    const result = createBranchSchema.safeParse({ name: 'Branch X', foo: 'bar' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).foo).toBeUndefined()
    }
  })
})

describe('updateBranchSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    const result = updateBranchSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts partial update with only name', () => {
    const result = updateBranchSchema.safeParse({ name: 'New Name' })
    expect(result.success).toBe(true)
  })

  it('accepts partial update with only code', () => {
    const result = updateBranchSchema.safeParse({ code: 'BR-02' })
    expect(result.success).toBe(true)
  })

  it('accepts partial update with only address', () => {
    const result = updateBranchSchema.safeParse({ address: '456 Oak Ave' })
    expect(result.success).toBe(true)
  })

  it('rejects when name is explicitly set to empty string', () => {
    const result = updateBranchSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })
})
