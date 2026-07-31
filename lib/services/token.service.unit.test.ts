/**
 * Unit tests for token.service — RED phase.
 * Tests sign/verify roundtrips, expiry, tamper detection, and claims.
 * Uses fake env secrets — no DB, no server-only constraint.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, beforeAll } from 'vitest'
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './token.service'
import type { Role } from '@/lib/types'

// Inject fake secrets for unit tests
beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long_for_hs256'
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long_for_hs256'
  process.env.ACCESS_TTL = '900'
  process.env.REFRESH_TTL = '604800'
})

const sampleRole: Role = 'Administrador'

describe('token.service — access token', () => {
  it('signAccessToken returns a non-empty string', async () => {
    const token = await signAccessToken({
      sub: 'user_id_123',
      cedula: '12345678',
      role: sampleRole,
      pcr: true,
    })
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('verifyAccessToken returns claims matching the input', async () => {
    const payload = {
      sub: 'user_id_abc',
      cedula: '98765432',
      role: 'Secretario' as Role,
      pcr: false,
    }
    const token = await signAccessToken(payload)
    const claims = await verifyAccessToken(token)
    expect(claims.sub).toBe(payload.sub)
    expect(claims.cedula).toBe(payload.cedula)
    expect(claims.role).toBe(payload.role)
    expect(claims.pcr).toBe(payload.pcr)
    expect(claims.typ).toBe('access')
  })

  it('claims carry role and pcr fields', async () => {
    const token = await signAccessToken({
      sub: 'u1',
      cedula: '11223344',
      role: 'Empleado' as Role,
      pcr: true,
    })
    const claims = await verifyAccessToken(token)
    expect(claims.role).toBe('Empleado')
    expect(claims.pcr).toBe(true)
  })

  it('verifyAccessToken rejects a tampered token', async () => {
    const token = await signAccessToken({
      sub: 'u1',
      cedula: '12345678',
      role: sampleRole,
      pcr: false,
    })
    const tampered = token.slice(0, -5) + 'XXXXX'
    await expect(verifyAccessToken(tampered)).rejects.toThrow()
  })

  it('verifyAccessToken rejects a token signed with wrong secret', async () => {
    // Temporarily use wrong secret to generate a token
    const originalSecret = process.env.JWT_ACCESS_SECRET
    process.env.JWT_ACCESS_SECRET = 'wrong_secret_that_is_at_least_32_chars_long!'
    const badToken = await signAccessToken({
      sub: 'u1',
      cedula: '12345678',
      role: sampleRole,
      pcr: false,
    })
    // Restore correct secret
    process.env.JWT_ACCESS_SECRET = originalSecret
    await expect(verifyAccessToken(badToken)).rejects.toThrow()
  })
})

describe('token.service — refresh token', () => {
  it('signRefreshToken returns a non-empty string', async () => {
    const token = await signRefreshToken({
      sub: 'user_id_123',
      jti: 'unique_token_id',
    })
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('verifyRefreshToken roundtrip returns matching claims', async () => {
    const payload = { sub: 'user_id_xyz', jti: 'jti_value_123' }
    const token = await signRefreshToken(payload)
    const claims = await verifyRefreshToken(token)
    expect(claims.sub).toBe(payload.sub)
    expect(claims.jti).toBe(payload.jti)
    expect(claims.typ).toBe('refresh')
  })

  it('verifyRefreshToken rejects a tampered token', async () => {
    const token = await signRefreshToken({ sub: 'u1', jti: 'jti1' })
    const tampered = token.slice(0, -3) + 'ZZZ'
    await expect(verifyRefreshToken(tampered)).rejects.toThrow()
  })
})
