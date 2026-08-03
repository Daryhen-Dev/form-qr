/**
 * Operational API client — employee assignment domain.
 *
 * Thin wrappers over `requestProtected` for the existing assignment contracts:
 * `GET /api/v1/branches/:id/employees`, `GET /api/v1/users/:id/branch` and
 * `POST /api/v1/branches/:id/employees`. Every operation returns a
 * `ProtectedResult<T>`; the client owns the Authorization header, so callers
 * only supply the access token as an argument. Role restrictions are UI
 * concerns and are NOT enforced here.
 */
import {
  HTTP_METHOD,
  requestProtected,
  type ProtectedRequest,
} from '@/lib/operational-api/client'
import type {
  AssignEmployeeRequest,
  AssignmentDTO,
  BranchDTO,
  EmployeeBranchViewDTO,
  ProtectedResult,
} from '@/lib/operational-api/contracts'

/** Field names that may be surfaced as field-level issues on HTTP 422. */
const ASSIGNMENT_FIELD_NAMES = ['userId'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asAssignmentDTO(value: unknown): AssignmentDTO | undefined {
  if (!isRecord(value)) return undefined
  const { id, branchId, userId, assignedAt, unassignedAt } = value

  if (
    typeof id === 'string' &&
    typeof branchId === 'string' &&
    typeof userId === 'string' &&
    typeof assignedAt === 'string' &&
    (typeof unassignedAt === 'string' || unassignedAt === null)
  ) {
    return value as unknown as AssignmentDTO
  }

  return undefined
}

function asBranchDTO(value: unknown): BranchDTO | undefined {
  if (!isRecord(value)) return undefined
  const { id, name, code, address, createdAt, updatedAt } = value

  if (
    typeof id === 'string' &&
    typeof name === 'string' &&
    (typeof code === 'string' || code === null) &&
    (typeof address === 'string' || address === null) &&
    typeof createdAt === 'string' &&
    typeof updatedAt === 'string'
  ) {
    return value as unknown as BranchDTO
  }

  return undefined
}

function projectEmployees(payload: unknown): AssignmentDTO[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.employees)) return undefined
  const employees = payload.employees.map(asAssignmentDTO)
  return employees.every(
    (assignment): assignment is AssignmentDTO => assignment !== undefined
  )
    ? employees
    : undefined
}

function projectEmployeeBranch(
  payload: unknown
): EmployeeBranchViewDTO | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.history)) return undefined

  const branch =
    payload.branch === null ? null : asBranchDTO(payload.branch)
  if (branch === undefined) return undefined

  const history = payload.history.map(asAssignmentDTO)
  if (
    !history.every(
      (assignment): assignment is AssignmentDTO => assignment !== undefined
    )
  ) {
    return undefined
  }

  return { branch, history }
}

function projectAssignment(payload: unknown): AssignmentDTO | undefined {
  return isRecord(payload) ? asAssignmentDTO(payload.assignment) : undefined
}

function send<T>(request: ProtectedRequest<T>): Promise<ProtectedResult<T>> {
  return requestProtected(request)
}

/** GET /api/v1/branches/:id/employees — active assignments for a branch. */
export function listBranchEmployees(
  accessToken: string,
  branchId: string
): Promise<ProtectedResult<AssignmentDTO[]>> {
  return send({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `/branches/${encodeURIComponent(branchId)}/employees`,
    project: projectEmployees,
  })
}

/** GET /api/v1/users/:id/branch — current branch and assignment history. */
export function getEmployeeBranch(
  accessToken: string,
  userId: string
): Promise<ProtectedResult<EmployeeBranchViewDTO>> {
  return send({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `/users/${encodeURIComponent(userId)}/branch`,
    project: projectEmployeeBranch,
  })
}

/** POST /api/v1/branches/:id/employees — assigns an employee to a branch. */
export function assignEmployee(
  accessToken: string,
  branchId: string,
  body: AssignEmployeeRequest
): Promise<ProtectedResult<AssignmentDTO>> {
  return send({
    accessToken,
    method: HTTP_METHOD.POST,
    path: `/branches/${encodeURIComponent(branchId)}/employees`,
    body: JSON.stringify(body),
    project: projectAssignment,
    visibleFieldNames: ASSIGNMENT_FIELD_NAMES,
  })
}
