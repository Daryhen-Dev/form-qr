/**
 * Shared TypeScript interfaces for form-qr.
 * Plain TS interfaces only — no @prisma/client imports allowed here (NFR-3).
 */

/** Result returned by the health check service. */
export interface HealthCheckResult {
  status: 'ok' | 'error'
  /** UTC ISO-8601 timestamp from the database round-trip. Present on success. */
  timestamp?: string
  /** Short error code. Present on failure. */
  error?: string
}

// ---------------------------------------------------------------------------
// Auth + Users + Roles (Slice 2)
// ---------------------------------------------------------------------------

/**
 * Runtime const object mirroring the Prisma Role enum.
 * Use ROLE.ADMINISTRADOR etc. in code; never import from @prisma/client in
 * services, validations, or types modules (NFR-AUTH-3).
 */
export const ROLE = {
  ADMINISTRADOR: 'Administrador',
  SECRETARIO: 'Secretario',
  EMPLEADO: 'Empleado',
} as const

/** Union type derived from ROLE — kept in sync with prisma Role enum. */
export type Role = (typeof ROLE)[keyof typeof ROLE]

/** Claims embedded in a signed access JWT. */
export interface JwtAccessClaims {
  sub: string
  cedula: string
  role: Role
  /** passwordChangeRequired — true when the user must change their password. */
  pcr: boolean
  typ: 'access'
  iat: number
  exp: number
}

/** Claims embedded in a signed refresh JWT. */
export interface JwtRefreshClaims {
  sub: string
  jti: string
  typ: 'refresh'
  iat: number
  exp: number
}

/**
 * Authenticated principal extracted from a verified access JWT.
 * Passed to services to enforce authorization rules.
 */
export interface Principal {
  userId: string
  role: Role
  passwordChangeRequired: boolean
}

/**
 * User data transfer object — safe to include in API responses.
 * NEVER includes passwordHash (NFR-AUTH-4).
 */
export interface UserDTO {
  id: string
  nombres: string
  apellidos: string
  cedula: string
  role: Role
  passwordChangeRequired: boolean
  createdAt: string // UTC ISO-8601
  updatedAt: string // UTC ISO-8601
}

