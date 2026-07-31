import { describe, it, expect } from 'vitest'
import { create as repoCreate } from '@/lib/repositories/user.repository'
import { login, refresh, logout, changePassword } from '@/lib/services/auth.service'
import { verifyAccessToken } from '@/lib/services/token.service'
import { hash as bcryptHash } from '@/lib/services/password.service'
import type { UserRow } from '@/lib/repositories/user.repository'

/**
 * Seeds a user via the same repository that auth.service uses (lib/db singleton).
 * Avoids FK violations that arise when seeding with a separate Prisma client.
 */
async function seedUser(overrides: Partial<{
  nombres: string
  apellidos: string
  cedula: string
  role: string
  passwordChangeRequired: boolean
}> = {}): Promise<UserRow> {
  const cedula = overrides.cedula ?? '11223344'
  const passwordHash = await bcryptHash(cedula)

  return repoCreate({
    nombres: overrides.nombres ?? 'Test',
    apellidos: overrides.apellidos ?? 'User',
    cedula,
    passwordHash,
    role: (overrides.role ?? 'Administrador') as 'Administrador' | 'Secretario' | 'Empleado',
    passwordChangeRequired: overrides.passwordChangeRequired ?? true,
  })
}

describe('auth.service integration — login flow', () => {
  it('H.1 — successful login with seeded admin returns tokens', async () => {
    const cedula = '11223344'
    await seedUser({ cedula, passwordChangeRequired: true })

    const result = await login(cedula, cedula) // initial password = cedula

    expect(result.accessToken).toBeTruthy()
    expect(result.refreshToken).toBeTruthy()
    expect(result.passwordChangeRequired).toBe(true)
    expect(result.user.cedula).toBe(cedula)
    // passwordHash must NOT be in the response
    expect(result.user).not.toHaveProperty('passwordHash')
  })

  it('H.1 — wrong password returns 401', async () => {
    const cedula = '11223344'
    await seedUser({ cedula })

    await expect(login(cedula, 'wrongpassword')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('H.1 — unknown cédula returns 401', async () => {
    await expect(login('00000000', 'any')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('H.6 — no passwordHash in login response', async () => {
    const cedula = '11223344'
    await seedUser({ cedula })

    const result = await login(cedula, cedula)

    // Neither the user nor the top-level response should have passwordHash
    const asJson = JSON.stringify(result)
    expect(asJson).not.toContain('passwordHash')
  })
})

describe('auth.service integration — change-password flow', () => {
  it('H.2 — change-password clears pcr flag', async () => {
    const cedula = '22334455'
    const user = await seedUser({ cedula, passwordChangeRequired: true })

    await changePassword(user.id, 'NewSecureP@ss1')

    // Re-login to get fresh data
    const loginResult = await login(cedula, 'NewSecureP@ss1')
    expect(loginResult.passwordChangeRequired).toBe(false)
  })

  it('H.2 — after change-password, old cedula-password is rejected', async () => {
    const cedula = '22334455'
    const user = await seedUser({ cedula, passwordChangeRequired: true })

    await changePassword(user.id, 'NewSecureP@ss1')

    // Old password (= cedula) should now fail
    await expect(login(cedula, cedula)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('H.2 — after change-password, new password succeeds', async () => {
    const cedula = '22334455'
    const user = await seedUser({ cedula, passwordChangeRequired: true })
    const newPw = 'NewSecureP@ss1'

    await changePassword(user.id, newPw)

    const result = await login(cedula, newPw)
    expect(result.accessToken).toBeTruthy()
    expect(result.passwordChangeRequired).toBe(false)
  })

  it('H.2 — change-password revokes all existing refresh tokens', async () => {
    const cedula = '22334455'
    const user = await seedUser({ cedula })
    const loginResult = await login(cedula, cedula)
    const oldRefreshToken = loginResult.refreshToken

    await changePassword(user.id, 'NewSecureP@ss1')

    // Old refresh token should be revoked
    await expect(refresh(oldRefreshToken)).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('auth.service integration — refresh rotation', () => {
  it('H.3 — valid refresh token yields new access + refresh tokens', async () => {
    const cedula = '33445566'
    await seedUser({ cedula })
    const loginResult = await login(cedula, cedula)

    const refreshResult = await refresh(loginResult.refreshToken)

    expect(refreshResult.accessToken).toBeTruthy()
    expect(refreshResult.refreshToken).toBeTruthy()
    // New refresh token should differ from old (rotation)
    expect(refreshResult.refreshToken).not.toBe(loginResult.refreshToken)
  })

  it('H.3 — logout then refresh-reuse returns 401', async () => {
    const cedula = '33445566'
    await seedUser({ cedula })
    const loginResult = await login(cedula, cedula)

    await logout(loginResult.refreshToken)

    await expect(refresh(loginResult.refreshToken)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('H.3 — refresh token is rotated (old token invalid after use)', async () => {
    const cedula = '33445566'
    await seedUser({ cedula })
    const loginResult = await login(cedula, cedula)

    await refresh(loginResult.refreshToken)

    // Old token should be revoked after rotation
    await expect(refresh(loginResult.refreshToken)).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('auth.service integration — access token claims', () => {
  it('access token carries correct role and pcr claims', async () => {
    const cedula = '44556677'
    await seedUser({ cedula, role: 'Secretario', passwordChangeRequired: true })

    const { accessToken } = await login(cedula, cedula)
    const claims = await verifyAccessToken(accessToken)

    expect(claims.role).toBe('Secretario')
    expect(claims.pcr).toBe(true)
    expect(claims.sub).toBeTruthy()
  })

  it('access token pcr=false after password change', async () => {
    const cedula = '55667788'
    const user = await seedUser({ cedula, passwordChangeRequired: true })

    await changePassword(user.id, 'BrandNewP@ss99')
    const { accessToken } = await login(cedula, 'BrandNewP@ss99')
    const claims = await verifyAccessToken(accessToken)

    expect(claims.pcr).toBe(false)
    expect(claims.role).toBe('Administrador')
  })
})
