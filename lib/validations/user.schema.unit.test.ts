/**
 * Unit tests for user.schema — RED phase.
 * Tests Zod validation rules for createUser and updateUser schemas.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it } from 'vitest'
import { createUserSchema, updateUserSchema } from './user.schema'

const validCreatePayload = {
  nombres: 'John',
  apellidos: 'Doe',
  cedula: '12345678',
  role: 'Empleado' as const,
}

describe('createUserSchema', () => {
  it('accepts a valid payload with all required fields', () => {
    const result = createUserSchema.safeParse(validCreatePayload)
    expect(result.success).toBe(true)
  })

  it('rejects when role is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { role: _role, ...withoutRole } = validCreatePayload
    const result = createUserSchema.safeParse(withoutRole)
    expect(result.success).toBe(false)
  })

  it('rejects when nombres is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { nombres: _nombres, ...withoutNombres } = validCreatePayload
    const result = createUserSchema.safeParse(withoutNombres)
    expect(result.success).toBe(false)
  })

  it('rejects when apellidos is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { apellidos: _apellidos, ...withoutApellidos } = validCreatePayload
    const result = createUserSchema.safeParse(withoutApellidos)
    expect(result.success).toBe(false)
  })

  it('rejects non-numeric cédula', () => {
    const result = createUserSchema.safeParse({ ...validCreatePayload, cedula: 'abc123' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const cedulaIssue = result.error.issues.find(i => i.path.includes('cedula'))
      expect(cedulaIssue).toBeDefined()
    }
  })

  it('rejects cédula shorter than 6 digits', () => {
    const result = createUserSchema.safeParse({ ...validCreatePayload, cedula: '12345' })
    expect(result.success).toBe(false)
  })

  it('rejects cédula longer than 10 digits', () => {
    const result = createUserSchema.safeParse({ ...validCreatePayload, cedula: '12345678901' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid role value', () => {
    const result = createUserSchema.safeParse({ ...validCreatePayload, role: 'Superadmin' })
    expect(result.success).toBe(false)
  })

  it('accepts role=Administrador', () => {
    const result = createUserSchema.safeParse({ ...validCreatePayload, role: 'Administrador' })
    expect(result.success).toBe(true)
  })

  it('accepts role=Secretario', () => {
    const result = createUserSchema.safeParse({ ...validCreatePayload, role: 'Secretario' })
    expect(result.success).toBe(true)
  })

  it('accepts role=Empleado', () => {
    const result = createUserSchema.safeParse({ ...validCreatePayload, role: 'Empleado' })
    expect(result.success).toBe(true)
  })
})

describe('updateUserSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    const result = updateUserSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts partial update with only nombres', () => {
    const result = updateUserSchema.safeParse({ nombres: 'Jane' })
    expect(result.success).toBe(true)
  })

  it('accepts partial update with nombres and apellidos', () => {
    const result = updateUserSchema.safeParse({ nombres: 'Jane', apellidos: 'Smith' })
    expect(result.success).toBe(true)
  })

  it('strips the role field (role is immutable — not in updateUserSchema)', () => {
    // The updateUserSchema should NOT include role; if role is passed it should be stripped
    const result = updateUserSchema.safeParse({ nombres: 'Jane', role: 'Administrador' })
    expect(result.success).toBe(true)
    if (result.success) {
      // role must not appear in the output
      expect((result.data as Record<string, unknown>).role).toBeUndefined()
    }
  })

  it('strips the cedula field (cedula is immutable — not in updateUserSchema)', () => {
    const result = updateUserSchema.safeParse({ nombres: 'Jane', cedula: '12345678' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).cedula).toBeUndefined()
    }
  })
})
