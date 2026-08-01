/**
 * Unit tests for auth.schema — RED phase.
 * Tests Zod validation rules for login, changePassword, refresh schemas.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it } from 'vitest'
import { loginSchema, changePasswordSchema, refreshSchema } from './auth.schema'

describe('loginSchema', () => {
  it('rejects non-numeric cédula', () => {
    const result = loginSchema.safeParse({ cedula: 'ABCDE', password: 'secret' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const cedunaIssue = result.error.issues.find(i =>
        i.path.includes('cedula')
      )
      expect(cedunaIssue).toBeDefined()
    }
  })

  it('rejects mixed alphanumeric cédula', () => {
    const result = loginSchema.safeParse({ cedula: 'abc123', password: 'x' })
    expect(result.success).toBe(false)
  })

  it('rejects cédula shorter than 6 digits', () => {
    const result = loginSchema.safeParse({ cedula: '12345', password: 'x' })
    expect(result.success).toBe(false)
  })

  it('rejects cédula longer than 15 digits', () => {
    const result = loginSchema.safeParse({ cedula: '1234567890123456', password: 'x' })
    expect(result.success).toBe(false)
  })

  it('accepts a valid 8-digit numeric cédula with password', () => {
    const result = loginSchema.safeParse({ cedula: '12345678', password: 'secret' })
    expect(result.success).toBe(true)
  })

  it('accepts a 6-digit cédula (minimum)', () => {
    const result = loginSchema.safeParse({ cedula: '123456', password: 'x' })
    expect(result.success).toBe(true)
  })

  it('accepts a 15-digit cédula (maximum)', () => {
    const result = loginSchema.safeParse({ cedula: '123456789012345', password: 'x' })
    expect(result.success).toBe(true)
  })

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ cedula: '12345678', password: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing cedula', () => {
    const result = loginSchema.safeParse({ password: 'secret' })
    expect(result.success).toBe(false)
  })

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({ cedula: '12345678' })
    expect(result.success).toBe(false)
  })
})

describe('changePasswordSchema', () => {
  it('rejects empty newPassword', () => {
    const result = changePasswordSchema.safeParse({ newPassword: '' })
    expect(result.success).toBe(false)
  })

  it('rejects newPassword shorter than 8 characters', () => {
    const result = changePasswordSchema.safeParse({ newPassword: 'short' })
    expect(result.success).toBe(false)
  })

  it('accepts a valid newPassword of 8+ characters', () => {
    const result = changePasswordSchema.safeParse({ newPassword: 'validPassword1' })
    expect(result.success).toBe(true)
  })

  it('rejects missing newPassword', () => {
    const result = changePasswordSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('refreshSchema', () => {
  it('rejects empty refreshToken', () => {
    const result = refreshSchema.safeParse({ refreshToken: '' })
    expect(result.success).toBe(false)
  })

  it('accepts a non-empty refreshToken', () => {
    const result = refreshSchema.safeParse({ refreshToken: 'some.jwt.token' })
    expect(result.success).toBe(true)
  })

  it('rejects missing refreshToken', () => {
    const result = refreshSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
