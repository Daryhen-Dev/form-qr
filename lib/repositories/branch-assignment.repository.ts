import 'server-only'
import { prisma } from '@/lib/db'

/** Shape of an assignment row as returned from the DB. */
export interface AssignmentRow {
  id: string
  branchId: string
  userId: string
  assignedAt: Date
  unassignedAt: Date | null
  createdAt: Date
}

/**
 * Typed error for a unique constraint violation on the active assignment index
 * ("uniq_active_assignment_per_user"). The service layer catches this and maps
 * it to HTTP 409.
 */
export class AssignmentConflictError extends Error {
  constructor(message = 'active_assignment_conflict') {
    super(message)
    this.name = 'AssignmentConflictError'
  }
}

/** Returns true if err is a Prisma unique constraint violation (P2002). */
function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  )
}

/**
 * Returns the currently active (unassignedAt IS NULL) assignment for a user.
 * Returns null when the user has no active branch.
 */
export async function findActiveByUser(userId: string): Promise<AssignmentRow | null> {
  return prisma.branchAssignment.findFirst({
    where: { userId, unassignedAt: null },
  }) as Promise<AssignmentRow | null>
}

/**
 * Returns the full assignment history for a user, ordered by assignedAt descending
 * (most recent first — matches AD-5 and service contract).
 */
export async function findHistoryByUser(userId: string): Promise<AssignmentRow[]> {
  return prisma.branchAssignment.findMany({
    where: { userId },
    orderBy: { assignedAt: 'desc' },
  }) as Promise<AssignmentRow[]>
}

/**
 * Returns all currently active (unassignedAt IS NULL) assignments for a branch.
 */
export async function findActiveByBranch(branchId: string): Promise<AssignmentRow[]> {
  return prisma.branchAssignment.findMany({
    where: { branchId, unassignedAt: null },
  }) as Promise<AssignmentRow[]>
}

/**
 * Atomically reassigns a user to a new branch.
 *
 * Uses an interactive SERIALIZABLE transaction to guarantee that the steps:
 *  1. Close the current active assignment (set unassignedAt = now).
 *  2. Create the new active assignment row.
 * are performed atomically with the strongest isolation.
 *
 * If two concurrent calls race to create an active row for the same userId, the
 * DB partial unique index ("uniq_active_assignment_per_user") will reject the
 * second commit with a P2002 violation, which is caught and re-thrown as
 * AssignmentConflictError so the service can map it to HTTP 409.
 */
export async function reassign(
  userId: string,
  branchId: string
): Promise<AssignmentRow> {
  const now = new Date()

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        // Step 1: close any current active assignment
        await tx.branchAssignment.updateMany({
          where: { userId, unassignedAt: null },
          data: { unassignedAt: now },
        })

        // Step 2: create the new active assignment
        return tx.branchAssignment.create({
          data: {
            userId,
            branchId,
            assignedAt: now,
          },
        })
      },
      { isolationLevel: 'Serializable' }
    )

    return created as AssignmentRow
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new AssignmentConflictError()
    }
    throw err
  }
}
