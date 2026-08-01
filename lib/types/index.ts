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

// ---------------------------------------------------------------------------
// Branches + Employee Assignment (Slice 3)
// No @prisma/client imports — DTOs are plain TS interfaces (NFR-BR-8).
// ---------------------------------------------------------------------------

/** Branch data transfer object — safe to include in API responses. */
export interface BranchDTO {
  id: string
  name: string
  code: string | null
  address: string | null
  createdAt: string // UTC ISO-8601
  updatedAt: string // UTC ISO-8601
}

/** Assignment record data transfer object — safe to include in API responses. */
export interface AssignmentDTO {
  id: string
  branchId: string
  userId: string
  assignedAt: string // UTC ISO-8601
  unassignedAt: string | null // UTC ISO-8601; null when the assignment is active
}

/**
 * Response shape for the employee-branch lookup endpoint.
 * Returns the current active branch (null when unassigned) and the full
 * assignment history ordered by assignedAt descending (AD-5).
 */
export interface EmployeeBranchViewDTO {
  branch: BranchDTO | null
  history: AssignmentDTO[]
}

// ---------------------------------------------------------------------------
// Questionnaire Templates + Versioning (Slice 4)
// No @prisma/client imports — DTOs are plain TS interfaces (NFR-R7#3).
// ---------------------------------------------------------------------------

/**
 * Runtime const object for question types.
 * Use QUESTION_TYPE.BOOLEAN etc. in code; never import from @prisma/client in
 * services, validations, or types modules.
 */
export const QUESTION_TYPE = {
  BOOLEAN: 'boolean',
  SINGLE_CHOICE: 'single_choice',
  MULTIPLE_CHOICE: 'multiple_choice',
  SCALE: 'scale',
  SHORT_TEXT: 'short_text',
  LONG_TEXT: 'long_text',
  NUMBER: 'number',
  DATE: 'date',
  TIME: 'time',
  PHOTO: 'photo',
  FILE: 'file',
} as const

/** Union type derived from QUESTION_TYPE — kept in sync with prisma QuestionType enum. */
export type QuestionType = (typeof QUESTION_TYPE)[keyof typeof QUESTION_TYPE]

/**
 * Runtime const object for version statuses.
 */
export const VERSION_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
} as const

/** Union type derived from VERSION_STATUS — kept in sync with prisma VersionStatus enum. */
export type VersionStatus = (typeof VERSION_STATUS)[keyof typeof VERSION_STATUS]

/** Questionnaire template data transfer object — safe to include in API responses. */
export interface QuestionnaireDTO {
  id: string
  title: string
  description: string | null
  currentVersionId: string | null
  createdAt: string // UTC ISO-8601
  updatedAt: string // UTC ISO-8601
}

/** Questionnaire version data transfer object — safe to include in API responses. */
export interface QuestionnaireVersionDTO {
  id: string
  questionnaireId: string
  versionNumber: number
  status: VersionStatus
  publishedAt: string | null // UTC ISO-8601; null when draft
  createdAt: string // UTC ISO-8601
  updatedAt: string // UTC ISO-8601
}

/** Question data transfer object — safe to include in API responses. */
export interface QuestionDTO {
  id: string
  order: number
  type: QuestionType
  prompt: string
  required: boolean
  config: Record<string, unknown>
}

/** Questionnaire–branch assignment data transfer object — safe to include in API responses. */
export interface QuestionnaireBranchDTO {
  id: string
  questionnaireId: string
  branchId: string
  assignedAt: string // UTC ISO-8601
}

