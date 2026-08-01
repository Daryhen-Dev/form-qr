import 'server-only'
import { prisma } from '@/lib/db'

/** Shape of a branch row as returned from the DB. */
export interface BranchRow {
  id: string
  name: string
  code: string | null
  address: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/** Shape of data used to create a new branch row. */
export interface CreateBranchData {
  name: string
  code?: string
  address?: string
}

/** Shape of data used to update an existing branch row (all fields optional). */
export interface UpdateBranchData {
  name?: string
  code?: string
  address?: string
}

/**
 * Creates a new branch row.
 */
export async function create(data: CreateBranchData): Promise<BranchRow> {
  return prisma.branch.create({
    data: {
      name: data.name,
      code: data.code ?? null,
      address: data.address ?? null,
    },
  }) as Promise<BranchRow>
}

/**
 * Finds an active (non-deleted) branch by ID.
 * Returns null if not found or soft-deleted.
 */
export async function findById(id: string): Promise<BranchRow | null> {
  return prisma.branch.findFirst({
    where: { id, deletedAt: null },
  }) as Promise<BranchRow | null>
}

/**
 * Returns all active (non-deleted) branches ordered by createdAt ascending.
 * Soft-deleted branches are excluded by the default filter.
 */
export async function findAll(): Promise<BranchRow[]> {
  return prisma.branch.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  }) as Promise<BranchRow[]>
}

/**
 * Updates allowed fields on an existing branch row.
 * Caller MUST ensure the id refers to an active branch.
 */
export async function update(id: string, data: UpdateBranchData): Promise<BranchRow> {
  return prisma.branch.update({
    where: { id },
    data,
  }) as Promise<BranchRow>
}

/**
 * Soft-deletes a branch by setting deletedAt to the current UTC timestamp.
 * Hard-delete is intentionally NOT exported from this module (spec requirement).
 */
export async function softDelete(id: string): Promise<BranchRow> {
  return prisma.branch.update({
    where: { id },
    data: { deletedAt: new Date() },
  }) as Promise<BranchRow>
}

/**
 * Counts the number of active (unassignedAt IS NULL) assignments for a branch.
 * Used by the soft-delete guard to block deletion when active employees are assigned.
 */
export async function countActiveAssignments(branchId: string): Promise<number> {
  return prisma.branchAssignment.count({
    where: { branchId, unassignedAt: null },
  })
}

// NOTE: Hard-delete is intentionally absent. Exporting a hard-delete function
// would violate the spec requirement that deletion is soft-only.
