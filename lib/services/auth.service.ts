import 'server-only'
import crypto from 'node:crypto'
import { findByCedula, findById, update } from '@/lib/repositories/user.repository'
import {
  create as createRefreshToken,
  findByHash,
  revoke,
  revokeAllForUser,
} from '@/lib/repositories/refresh-token.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { verify, hash } from '@/lib/services/password.service'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@/lib/services/token.service'
import type { UserDTO } from '@/lib/types'

/** Generic HTTP-shaped service error. Services throw this; handlers map to HTTP status. */
export class ServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

/** SHA-256 hash of a JWT string for storage. Never store the raw token. */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

/** Maps a raw DB user row to a safe UserDTO (no passwordHash). */
function toUserDTO(user: {
  id: string
  nombres: string
  apellidos: string
  cedula: string
  role: string
  passwordChangeRequired: boolean
  createdAt: Date
  updatedAt: Date
}): UserDTO {
  return {
    id: user.id,
    nombres: user.nombres,
    apellidos: user.apellidos,
    cedula: user.cedula,
    role: user.role as UserDTO['role'],
    passwordChangeRequired: user.passwordChangeRequired,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

/** Result shape for a successful login. */
export interface LoginResult {
  accessToken: string
  refreshToken: string
  passwordChangeRequired: boolean
  user: UserDTO
}

/**
 * Authenticates a user by cédula + password.
 * Throws ServiceError(401) on bad credentials — does NOT reveal which field failed.
 * Returns access+refresh tokens and the user's passwordChangeRequired flag.
 */
export async function login(cedula: string, password: string): Promise<LoginResult> {
  // Constant-time: always look up the user first, then verify
  const user = await findByCedula(cedula)

  if (!user) {
    throw new ServiceError(401, 'invalid_credentials')
  }

  const passwordValid = await verify(password, user.passwordHash)
  if (!passwordValid) {
    throw new ServiceError(401, 'invalid_credentials')
  }

  // Issue tokens
  const refreshRaw = await signRefreshToken({ sub: user.id, jti: crypto.randomUUID() })
  const accessToken = await signAccessToken({
    sub: user.id,
    cedula: user.cedula,
    role: user.role as UserDTO['role'],
    pcr: user.passwordChangeRequired,
  })

  // Persist hashed refresh token
  await createRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshRaw),
    expiresAt: new Date(Date.now() + parseInt(process.env.REFRESH_TTL ?? '604800', 10) * 1000),
  })

  return {
    accessToken,
    refreshToken: refreshRaw,
    passwordChangeRequired: user.passwordChangeRequired,
    user: toUserDTO(user),
  }
}

/** Result shape for a successful token refresh. */
export interface RefreshResult {
  accessToken: string
  refreshToken: string
}

/**
 * Issues a new access + refresh token pair given a valid, unrevoked refresh token.
 * Rotates the refresh token (old is revoked, new is created).
 * Throws ServiceError(401) if the token is invalid, expired, or already revoked.
 */
export async function refresh(rawRefreshToken: string): Promise<RefreshResult> {
  // Verify the JWT signature first
  const claims = await verifyRefreshToken(rawRefreshToken).catch(() => {
    throw new ServiceError(401, 'invalid_refresh_token')
  })

  // Check it exists in the DB and is not revoked
  const tokenHash = hashToken(rawRefreshToken)
  const storedToken = await findByHash(tokenHash)

  if (!storedToken || storedToken.revokedAt !== null || storedToken.expiresAt < new Date()) {
    throw new ServiceError(401, 'invalid_refresh_token')
  }

  // Find the user
  const user = await findById(claims.sub)
  if (!user) {
    throw new ServiceError(401, 'invalid_refresh_token')
  }

  // Rotate: revoke old token
  await revoke(storedToken.id)

  // Issue new tokens
  const newRefreshRaw = await signRefreshToken({ sub: user.id, jti: crypto.randomUUID() })
  const accessToken = await signAccessToken({
    sub: user.id,
    cedula: user.cedula,
    role: user.role as UserDTO['role'],
    pcr: user.passwordChangeRequired,
  })

  // Persist new refresh token
  await createRefreshToken({
    userId: user.id,
    tokenHash: hashToken(newRefreshRaw),
    expiresAt: new Date(Date.now() + parseInt(process.env.REFRESH_TTL ?? '604800', 10) * 1000),
  })

  return { accessToken, refreshToken: newRefreshRaw }
}

/**
 * Revokes the refresh token associated with the given raw token.
 * Succeeds gracefully if the token does not exist (already logged out / expired).
 */
export async function logout(rawRefreshToken: string): Promise<void> {
  const claims = await verifyRefreshToken(rawRefreshToken).catch(() => null)
  if (!claims) return

  const tokenHash = hashToken(rawRefreshToken)
  const storedToken = await findByHash(tokenHash)
  if (!storedToken) return

  await revoke(storedToken.id)
}

/**
 * Changes a user's password and clears the passwordChangeRequired flag.
 * Also revokes all existing refresh tokens for the user (forces re-login).
 * Writes an AuditLog entry on success.
 * Throws ServiceError(404) if the user is not found.
 */
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const user = await findById(userId)
  if (!user) {
    throw new ServiceError(404, 'user_not_found')
  }

  const newHash = await hash(newPassword)

  await update(userId, {
    passwordHash: newHash,
    passwordChangeRequired: false,
  })

  // Revoke all refresh tokens — user must re-login with the new password
  await revokeAllForUser(userId)

  await auditRecord({
    action: 'CHANGE_PASSWORD',
    entityType: 'User',
    entityId: userId,
    metadata: { initiatedBy: userId },
  })
}
