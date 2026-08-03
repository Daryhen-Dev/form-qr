/**
 * Operational API client — users domain.
 *
 * Thin wrappers over `requestProtected` for the existing `/api/v1/users`
 * contracts. Every operation returns a `ProtectedResult<T>`; the client owns
 * the Authorization header, so callers only supply the access token as an
 * argument. Role restrictions (e.g. Secretario) are UI concerns and are NOT
 * enforced here — this module only exposes the available operations.
 */
import {
  HTTP_METHOD,
  requestProtected,
  type ProtectedRequest,
} from '@/lib/operational-api/client'
import type {
  CreateUserRequest,
  ProtectedResult,
  UpdateUserRequest,
  UserDTO,
} from '@/lib/operational-api/contracts'

/** Field names that may be surfaced as field-level issues on HTTP 422. */
const USER_FIELD_NAMES = [
  'nombres',
  'apellidos',
  'cedula',
  'role',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asUserDTO(value: unknown): UserDTO | undefined {
  if (!isRecord(value)) return undefined
  const {
    id,
    nombres,
    apellidos,
    cedula,
    role,
    passwordChangeRequired,
    createdAt,
    updatedAt,
  } = value

  if (
    typeof id === 'string' &&
    typeof nombres === 'string' &&
    typeof apellidos === 'string' &&
    typeof cedula === 'string' &&
    typeof role === 'string' &&
    typeof passwordChangeRequired === 'boolean' &&
    typeof createdAt === 'string' &&
    typeof updatedAt === 'string'
  ) {
    return value as unknown as UserDTO
  }

  return undefined
}

function projectUser(payload: unknown): UserDTO | undefined {
  return isRecord(payload) ? asUserDTO(payload.user) : undefined
}

function projectUsers(payload: unknown): UserDTO[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.users)) return undefined
  const users = payload.users.map(asUserDTO)
  return users.every((user): user is UserDTO => user !== undefined)
    ? users
    : undefined
}

function projectSuccessFlag(payload: unknown): { success: true } | undefined {
  return isRecord(payload) && payload.success === true
    ? { success: true }
    : undefined
}

function jsonBody(payload: unknown): string {
  return JSON.stringify(payload)
}

function send<T>(request: ProtectedRequest<T>): Promise<ProtectedResult<T>> {
  return requestProtected(request)
}

/** GET /api/v1/users — lists all active users. */
export function listUsers(
  accessToken: string
): Promise<ProtectedResult<UserDTO[]>> {
  return send({
    accessToken,
    method: HTTP_METHOD.GET,
    path: '/users',
    project: projectUsers,
  })
}

/** GET /api/v1/users/:id — fetches a single user. */
export function getUser(
  accessToken: string,
  id: string
): Promise<ProtectedResult<UserDTO>> {
  return send({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `/users/${encodeURIComponent(id)}`,
    project: projectUser,
  })
}

/** POST /api/v1/users — creates a user. */
export function createUser(
  accessToken: string,
  body: CreateUserRequest
): Promise<ProtectedResult<UserDTO>> {
  return send({
    accessToken,
    method: HTTP_METHOD.POST,
    path: '/users',
    body: jsonBody(body),
    project: projectUser,
    visibleFieldNames: USER_FIELD_NAMES,
  })
}

/** PATCH /api/v1/users/:id — updates allowed fields on a user. */
export function updateUser(
  accessToken: string,
  id: string,
  body: UpdateUserRequest
): Promise<ProtectedResult<UserDTO>> {
  return send({
    accessToken,
    method: HTTP_METHOD.PATCH,
    path: `/users/${encodeURIComponent(id)}`,
    body: jsonBody(body),
    project: projectUser,
    visibleFieldNames: USER_FIELD_NAMES,
  })
}

/** DELETE /api/v1/users/:id — soft-deletes a user. */
export function deleteUser(
  accessToken: string,
  id: string
): Promise<ProtectedResult<{ success: true }>> {
  return send({
    accessToken,
    method: HTTP_METHOD.DELETE,
    path: `/users/${encodeURIComponent(id)}`,
    project: projectSuccessFlag,
  })
}
