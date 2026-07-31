import 'server-only'
import { prisma } from '@/lib/db'

/** Shape of a refresh token row returned from the DB. */
export interface RefreshTokenRow {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}

/** Data required to create a refresh token row. */
export interface CreateRefreshTokenData {
  userId: string
  tokenHash: string
  expiresAt: Date
}

/**
 * Persists a new refresh token row.
 * tokenHash MUST be the SHA-256 hash of the raw JWT — never store the raw token.
 */
export async function create(data: CreateRefreshTokenData): Promise<RefreshTokenRow> {
  return prisma.refreshToken.create({ data })
}

/**
 * Finds a refresh token row by its token hash.
 * Returns null if no matching row exists.
 */
export async function findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
  })
}

/**
 * Revokes a refresh token by setting revokedAt to now.
 * Used on logout and on token rotation (old token → revoked).
 */
export async function revoke(id: string): Promise<RefreshTokenRow> {
  return prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  })
}

/**
 * Revokes ALL refresh tokens for a given user.
 * Used as a security measure (e.g., password change, account action).
 */
export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
