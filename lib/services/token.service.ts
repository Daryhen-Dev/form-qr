import { SignJWT, jwtVerify } from 'jose'
import type { JwtAccessClaims, JwtRefreshClaims, Role } from '@/lib/types'

// NOTE: token.service MUST remain DB-free AND must NOT import 'server-only'.
// proxy.ts (PR2) imports this module to verify access tokens at the API boundary,
// so it must be safe to load outside the server-component context.
// Do NOT add Prisma or repository imports here.

function getSecret(envVar: string): Uint8Array {
  const secret = process.env[envVar]
  if (!secret) {
    throw new Error(`Environment variable ${envVar} is not set`)
  }
  return new TextEncoder().encode(secret)
}

function getTtl(envVar: string, defaultSeconds: number): string {
  const raw = process.env[envVar]
  const seconds = raw ? parseInt(raw, 10) : defaultSeconds
  return `${seconds}s`
}

/** Input payload for signing an access token. */
export interface AccessTokenInput {
  sub: string
  cedula: string
  role: Role
  pcr: boolean
}

/** Input payload for signing a refresh token. */
export interface RefreshTokenInput {
  sub: string
  jti: string
}

/**
 * Signs an access token (HS256).
 * Claims: sub, cedula, role, pcr (passwordChangeRequired), typ='access', iat, exp.
 * TTL is read from ACCESS_TTL env var (default: 900s = 15 min).
 */
export async function signAccessToken(payload: AccessTokenInput): Promise<string> {
  const secret = getSecret('JWT_ACCESS_SECRET')
  const ttl = getTtl('ACCESS_TTL', 900)

  return new SignJWT({
    cedula: payload.cedula,
    role: payload.role,
    pcr: payload.pcr,
    typ: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret)
}

/**
 * Verifies an access token and returns the typed claims.
 * Throws if the token is invalid, expired, or tampered.
 */
export async function verifyAccessToken(token: string): Promise<JwtAccessClaims> {
  const secret = getSecret('JWT_ACCESS_SECRET')
  const { payload } = await jwtVerify(token, secret)

  return payload as unknown as JwtAccessClaims
}

/**
 * Signs a refresh token (HS256).
 * Claims: sub, jti, typ='refresh', iat, exp.
 * TTL is read from REFRESH_TTL env var (default: 604800s = 7 days).
 */
export async function signRefreshToken(payload: RefreshTokenInput): Promise<string> {
  const secret = getSecret('JWT_REFRESH_SECRET')
  const ttl = getTtl('REFRESH_TTL', 604800)

  return new SignJWT({ typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setJti(payload.jti)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret)
}

/**
 * Verifies a refresh token and returns the typed claims.
 * Throws if the token is invalid, expired, or tampered.
 */
export async function verifyRefreshToken(token: string): Promise<JwtRefreshClaims> {
  const secret = getSecret('JWT_REFRESH_SECRET')
  const { payload } = await jwtVerify(token, secret)

  return payload as unknown as JwtRefreshClaims
}
