import 'server-only'
import {
  create as repoCreate,
  findById,
  findAll,
  update as repoUpdate,
  softDelete as repoSoftDelete,
  countActiveAssignments,
} from '@/lib/repositories/branch.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { ServiceError } from '@/lib/services/auth.service'
import type { Principal, BranchDTO } from '@/lib/types'
import type { CreateBranchInput, UpdateBranchInput } from '@/lib/validations/branch.schema'

/** Maps a raw DB branch row to a safe BranchDTO (ISO-8601 dates, no Prisma fields). */
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

/**
 * Creates a new branch.
 * Authorization: Administrador only — Secretario and Empleado receive 403.
 * Writes an AuditLog row on success.
 */
export async function createBranch(
  principal: Principal,
  dto: CreateBranchInput
): Promise<BranchDTO> {
  if (principal.role !== 'Administrador') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  const branch = await repoCreate({
    name: dto.name,
    code: dto.code,
    address: dto.address,
  })

  await auditRecord({
    action: 'CREATE',
    entityType: 'Branch',
    entityId: branch.id,
    metadata: { createdBy: principal.userId },
  })

  return toBranchDTO(branch)
}

/**
 * Lists all active (non-deleted) branches.
 * Authorization: Administrador and Secretario. Empleado receives 403.
 */
export async function listBranches(principal: Principal): Promise<BranchDTO[]> {
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  const branches = await findAll()
  return branches.map(toBranchDTO)
}

/**
 * Gets a single active branch by ID.
 * Authorization: Administrador and Secretario. Empleado receives 403.
 * Throws ServiceError(404) if not found or soft-deleted.
 */
export async function getBranch(principal: Principal, id: string): Promise<BranchDTO> {
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  const branch = await findById(id)
  if (!branch) {
    throw new ServiceError(404, 'branch_not_found')
  }

  return toBranchDTO(branch)
}

/**
 * Updates allowed fields on an existing active branch.
 * Authorization: Administrador only.
 * Throws ServiceError(404) if not found.
 * Writes an AuditLog row on success.
 */
export async function updateBranch(
  principal: Principal,
  id: string,
  dto: UpdateBranchInput
): Promise<BranchDTO> {
  if (principal.role !== 'Administrador') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  const existing = await findById(id)
  if (!existing) {
    throw new ServiceError(404, 'branch_not_found')
  }

  const updated = await repoUpdate(id, dto)

  await auditRecord({
    action: 'UPDATE',
    entityType: 'Branch',
    entityId: id,
    metadata: { updatedBy: principal.userId, fields: Object.keys(dto) },
  })

  return toBranchDTO(updated)
}

/**
 * Soft-deletes a branch (sets deletedAt = now).
 * Authorization: Administrador only.
 * Throws ServiceError(409) with 'branch_has_active_assignments' if active assignments exist.
 * Throws ServiceError(404) if not found.
 * Writes an AuditLog row on success.
 */
export async function softDeleteBranch(principal: Principal, id: string): Promise<void> {
  if (principal.role !== 'Administrador') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  const existing = await findById(id)
  if (!existing) {
    throw new ServiceError(404, 'branch_not_found')
  }

  const activeCount = await countActiveAssignments(id)
  if (activeCount > 0) {
    throw new ServiceError(409, 'branch_has_active_assignments')
  }

  await repoSoftDelete(id)

  await auditRecord({
    action: 'DELETE',
    entityType: 'Branch',
    entityId: id,
    metadata: { deletedBy: principal.userId },
  })
}
