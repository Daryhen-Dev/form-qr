import 'server-only'
import {
  reassign,
  findActiveByUser,
  findHistoryByUser,
  AssignmentConflictError,
} from '@/lib/repositories/branch-assignment.repository'
import { findById as findBranch } from '@/lib/repositories/branch.repository'
import { findById as findUser } from '@/lib/repositories/user.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { ServiceError } from '@/lib/services/auth.service'
import type {
  Principal,
  BranchDTO,
  AssignmentDTO,
  EmployeeBranchViewDTO,
} from '@/lib/types'
import type { AssignInput } from '@/lib/validations/assignment.schema'

/** Maps a raw branch row to a safe BranchDTO (ISO-8601 dates). */
function toBranchDTO(branch: {
  id: string
  name: string
  code: string | null
  address: string | null
  createdAt: Date
  updatedAt: Date
}): BranchDTO {
  return {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    address: branch.address,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  }
}

/** Maps a raw assignment row to a safe AssignmentDTO (ISO-8601 dates). */
function toAssignmentDTO(row: {
  id: string
  branchId: string
  userId: string
  assignedAt: Date
  unassignedAt: Date | null
}): AssignmentDTO {
  return {
    id: row.id,
    branchId: row.branchId,
    userId: row.userId,
    assignedAt: row.assignedAt.toISOString(),
    unassignedAt: row.unassignedAt ? row.unassignedAt.toISOString() : null,
  }
}

/**
 * Assigns (or reassigns) an Empleado-role user to a branch.
 *
 * Authorization:
 *  - Caller must be Administrador or Secretario (Empleado → 403).
 *  - Target user must have role Empleado (otherwise → 422 'not_assignable_role').
 *
 * Invariants:
 *  - Branch must exist and be active (otherwise → 404).
 *  - Target user must exist and be active (otherwise → 404).
 *  - Single-active-branch: the repo transaction closes the prior active assignment
 *    atomically. A concurrent race that breaks through the transaction is backstopped
 *    by the partial unique index → caught and re-thrown as 409 'assignment_conflict'.
 *
 * Writes an AuditLog row on success.
 */
export async function assignEmployee(
  principal: Principal,
  branchId: string,
  dto: AssignInput
): Promise<AssignmentDTO> {
  // Authorization: only Administrador and Secretario can assign
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  // Verify branch exists and is active
  const branch = await findBranch(branchId)
  if (!branch) {
    throw new ServiceError(404, 'branch_not_found')
  }

  // Verify target user exists and is active
  const targetUser = await findUser(dto.userId)
  if (!targetUser) {
    throw new ServiceError(404, 'user_not_found')
  }

  // Only Empleado-role users may be assigned to branches (AD-4b)
  if (targetUser.role !== 'Empleado') {
    throw new ServiceError(422, 'not_assignable_role')
  }

  // Perform the atomic reassign (close prior active → create new)
  let assignment
  try {
    assignment = await reassign(dto.userId, branchId)
  } catch (err) {
    if (err instanceof AssignmentConflictError) {
      throw new ServiceError(409, 'assignment_conflict')
    }
    throw err
  }

  await auditRecord({
    action: 'ASSIGN',
    entityType: 'BranchAssignment',
    entityId: assignment.id,
    metadata: {
      assignedBy: principal.userId,
      userId: dto.userId,
      branchId,
    },
  })

  return toAssignmentDTO(assignment)
}

/**
 * Returns the current active branch and full assignment history for an employee.
 *
 * Authorization: Administrador and Secretario only (Empleado → 403).
 *
 * Never returns 404 for an unassigned employee — returns { branch: null, history: [] }
 * so Slice-5 consumers can handle unassigned state gracefully (AD-5).
 *
 * History is ordered by assignedAt descending (newest first).
 */
export async function getEmployeeBranch(
  principal: Principal,
  userId: string
): Promise<EmployeeBranchViewDTO> {
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  const [activeAssignment, history] = await Promise.all([
    findActiveByUser(userId),
    findHistoryByUser(userId),
  ])

  let branchDTO: BranchDTO | null = null
  if (activeAssignment) {
    const branchRow = await findBranch(activeAssignment.branchId)
    if (branchRow) {
      branchDTO = toBranchDTO(branchRow)
    }
  }

  return {
    branch: branchDTO,
    history: history.map(toAssignmentDTO),
  }
}
