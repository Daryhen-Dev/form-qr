/**
 * Operational API client — branches domain.
 *
 * Thin wrappers over `requestProtected` for the existing `/api/v1/branches`
 * contracts. Every operation returns a `ProtectedResult<T>`; the client owns
 * the Authorization header, so callers only supply the access token as an
 * argument. Role restrictions (e.g. Secretario read-only) are UI concerns and
 * are NOT enforced here — this module only exposes the available operations.
 */
import {
  HTTP_METHOD,
  requestProtected,
  type ProtectedRequest,
} from '@/lib/operational-api/client'
import type {
  BranchDTO,
  CreateBranchRequest,
  ProtectedResult,
  UpdateBranchRequest,
} from '@/lib/operational-api/contracts'

/** Field names that may be surfaced as field-level issues on HTTP 422. */
const BRANCH_FIELD_NAMES = ['name', 'code', 'address'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function projectBranch(payload: unknown): BranchDTO | undefined {
  return isRecord(payload) ? asBranchDTO(payload.branch) : undefined
}

function projectBranches(payload: unknown): BranchDTO[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.branches)) return undefined
  const branches = payload.branches.map(asBranchDTO)
  return branches.every((branch): branch is BranchDTO => branch !== undefined)
    ? branches
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

/** GET /api/v1/branches — lists all active branches. */
export function listBranches(
  accessToken: string
): Promise<ProtectedResult<BranchDTO[]>> {
  return send({
    accessToken,
    method: HTTP_METHOD.GET,
    path: '/branches',
    project: projectBranches,
  })
}

/** GET /api/v1/branches/:id — fetches a single branch. */
export function getBranch(
  accessToken: string,
  id: string
): Promise<ProtectedResult<BranchDTO>> {
  return send({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `/branches/${encodeURIComponent(id)}`,
    project: projectBranch,
  })
}

/** POST /api/v1/branches — creates a branch. */
export function createBranch(
  accessToken: string,
  body: CreateBranchRequest
): Promise<ProtectedResult<BranchDTO>> {
  return send({
    accessToken,
    method: HTTP_METHOD.POST,
    path: '/branches',
    body: jsonBody(body),
    project: projectBranch,
    visibleFieldNames: BRANCH_FIELD_NAMES,
  })
}

/** PATCH /api/v1/branches/:id — updates allowed fields on a branch. */
export function updateBranch(
  accessToken: string,
  id: string,
  body: UpdateBranchRequest
): Promise<ProtectedResult<BranchDTO>> {
  return send({
    accessToken,
    method: HTTP_METHOD.PATCH,
    path: `/branches/${encodeURIComponent(id)}`,
    body: jsonBody(body),
    project: projectBranch,
    visibleFieldNames: BRANCH_FIELD_NAMES,
  })
}

/** DELETE /api/v1/branches/:id — soft-deletes (deactivates) a branch. */
export function deleteBranch(
  accessToken: string,
  id: string
): Promise<ProtectedResult<{ success: true }>> {
  return send({
    accessToken,
    method: HTTP_METHOD.DELETE,
    path: `/branches/${encodeURIComponent(id)}`,
    project: projectSuccessFlag,
  })
}
