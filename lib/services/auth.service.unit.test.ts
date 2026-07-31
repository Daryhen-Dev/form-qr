/**
 * Unit tests for auth.service — RED phase.
 * All repositories and password/token services are mocked.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest'

// Mock all dependencies before imports
vi.mock('@/lib/repositories/user.repository', () => ({
  findByCedula: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
}))
vi.mock('@/lib/repositories/refresh-token.repository', () => ({
  create: vi.fn(),
  findByHash: vi.fn(),
  revoke: vi.fn(),
  revokeAllForUser: vi.fn(),
}))
vi.mock('@/lib/repositories/audit.repository', () => ({
  record: vi.fn(),
}))
vi.mock('@/lib/services/password.service', () => ({
  hash: vi.fn(),
  verify: vi.fn(),
}))
vi.mock('@/lib/services/token.service', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}))

import { findByCedula, findById, update } from '@/lib/repositories/user.repository'
import {
  create as createRefreshToken,
  findByHash,
  revoke,
  revokeAllForUser,
} from '@/lib/repositories/refresh-token.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { hash, verify } from '@/lib/services/password.service'
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@/lib/services/token.service'
import { login, refresh as authRefresh, logout, changePassword } from './auth.service'

const mockFindByCedula = vi.mocked(findByCedula)
const mockFindById = vi.mocked(findById)
const mockUpdate = vi.mocked(update)
const mockCreateRefreshToken = vi.mocked(createRefreshToken)
const mockFindByHash = vi.mocked(findByHash)
const mockRevoke = vi.mocked(revoke)
vi.mocked(revokeAllForUser) // registered but not asserted on in unit tests
const mockAuditRecord = vi.mocked(auditRecord)
const mockHash = vi.mocked(hash)
const mockVerify = vi.mocked(verify)
const mockSignAccessToken = vi.mocked(signAccessToken)
vi.mocked(verifyAccessToken) // registered, used via token.service mock
const mockSignRefreshToken = vi.mocked(signRefreshToken)
const mockVerifyRefreshToken = vi.mocked(verifyRefreshToken)

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long_for_hs256'
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long_for_hs256'
  process.env.ACCESS_TTL = '900'
  process.env.REFRESH_TTL = '604800'
})

const activeUser = {
  id: 'user_01',
  nombres: 'John',
  apellidos: 'Doe',
  cedula: '12345678',
  passwordHash: '$2a$12$hashed',
  passwordChangeRequired: false,
  role: 'Administrador' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('auth.service.login', () => {
  it('throws with 401-equivalent error on wrong password', async () => {
    mockFindByCedula.mockResolvedValueOnce(activeUser)
    mockVerify.mockResolvedValueOnce(false)

    await expect(login('12345678', 'wrongpassword')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('throws with 401-equivalent error when user does not exist', async () => {
    mockFindByCedula.mockResolvedValueOnce(null)

    await expect(login('00000000', 'anypassword')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('returns accessToken, refreshToken, passwordChangeRequired on success', async () => {
    mockFindByCedula.mockResolvedValueOnce(activeUser)
    mockVerify.mockResolvedValueOnce(true)
    mockSignAccessToken.mockResolvedValueOnce('access.token.here')
    mockSignRefreshToken.mockResolvedValueOnce('refresh.token.here')
    mockCreateRefreshToken.mockResolvedValueOnce({
      id: 'rt_01',
      userId: activeUser.id,
      tokenHash: 'sha256hash',
      expiresAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    })

    const result = await login('12345678', 'correctpassword')

    expect(result.accessToken).toBe('access.token.here')
    expect(result.refreshToken).toBe('refresh.token.here')
    expect(typeof result.passwordChangeRequired).toBe('boolean')
  })

  it('does not expose passwordHash in the return value', async () => {
    mockFindByCedula.mockResolvedValueOnce(activeUser)
    mockVerify.mockResolvedValueOnce(true)
    mockSignAccessToken.mockResolvedValueOnce('access.token')
    mockSignRefreshToken.mockResolvedValueOnce('refresh.token')
    mockCreateRefreshToken.mockResolvedValueOnce({
      id: 'rt_02',
      userId: activeUser.id,
      tokenHash: 'hash',
      expiresAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    })

    const result = await login('12345678', 'correctpassword')
    expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined()
  })
})

describe('auth.service.changePassword', () => {
  it('updates passwordChangeRequired to false and sets new hash', async () => {
    mockFindById.mockResolvedValueOnce(activeUser)
    mockHash.mockResolvedValueOnce('$2a$12$newhash')
    mockUpdate.mockResolvedValueOnce({
      ...activeUser,
      passwordHash: '$2a$12$newhash',
      passwordChangeRequired: false,
    })
    mockAuditRecord.mockResolvedValueOnce(undefined as never)

    await changePassword(activeUser.id, 'newStrongPassword1')

    expect(mockHash).toHaveBeenCalledWith('newStrongPassword1')
    expect(mockUpdate).toHaveBeenCalledWith(activeUser.id, {
      passwordHash: '$2a$12$newhash',
      passwordChangeRequired: false,
    })
    expect(mockAuditRecord).toHaveBeenCalledOnce()
  })

  it('throws when user is not found', async () => {
    mockFindById.mockResolvedValueOnce(null)
    await expect(changePassword('nonexistent_id', 'newpass123')).rejects.toThrow()
  })
})

describe('auth.service.logout', () => {
  it('revokes the refresh token by its hash', async () => {
    const fakeToken = 'refresh.jwt.token'
    mockVerifyRefreshToken.mockResolvedValueOnce({
      sub: activeUser.id,
      jti: 'jti_123',
      typ: 'refresh',
      iat: 0,
      exp: 9999999999,
    })
    mockFindByHash.mockResolvedValueOnce({
      id: 'rt_01',
      userId: activeUser.id,
      tokenHash: 'sha256hash',
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      createdAt: new Date(),
    })
    mockRevoke.mockResolvedValueOnce({
      id: 'rt_01',
      userId: activeUser.id,
      tokenHash: 'sha256hash',
      expiresAt: new Date(),
      revokedAt: new Date(),
      createdAt: new Date(),
    })

    await logout(fakeToken)

    expect(mockRevoke).toHaveBeenCalled()
  })

  it('succeeds gracefully when refresh token is not found in DB', async () => {
    mockVerifyRefreshToken.mockResolvedValueOnce({
      sub: activeUser.id,
      jti: 'jti_xyz',
      typ: 'refresh',
      iat: 0,
      exp: 9999999999,
    })
    mockFindByHash.mockResolvedValueOnce(null)

    // logout should not throw when token is already gone
    await expect(logout('some.token')).resolves.not.toThrow()
  })
})
