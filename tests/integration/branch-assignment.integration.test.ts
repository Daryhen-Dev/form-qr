/**
 * Integration tests for branch assignment — authz, history, single-active invariant.
 *
 * Uses form_qr_test DB (via TEST_DATABASE_URL).
 * Covers spec requirements:
 *   - Employee-to-Branch Assignment (201, 403, 404, 422)
 *   - Single-Active-Branch Invariant (transaction + partial unique index)
 *   - Assignment History and Lookup (DESC order, unassigned → null)
 *   - Branch soft-delete blocked (409) when active assignments exist
 *   - Concurrent reassign: two simultaneous attempts → one succeeds, one 409
 *     (proves partial unique index backstops the transaction — G.2 RED test)
 *
 * Run with: pnpm vitest run --project integration
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hash as bcryptHash } from 'bcryptjs'
import {
  assignEmployee,
  getEmployeeBranch,
} from '@/lib/services/assignment.service'
import {
  softDeleteBranch,
  listBranches,
} from '@/lib/services/branch.service'
import type { Principal } from '@/lib/types'

const testDatabaseUrl = process.env.TEST_DATABASE_URL!
const adapter = new PrismaPg({ connectionString: testDatabaseUrl })
const prisma = new PrismaClient({ adapter })

// ---------------------------------------------------------------------------
// Principals
// ---------------------------------------------------------------------------

const adminPrincipal: Principal = {
  userId: 'admin-id',
  role: 'Administrador',
  passwordChangeRequired: false,
}

const secPrincipal: Principal = {
  userId: 'sec-id',
  role: 'Secretario',
  passwordChangeRequired: false,
}

const empPrincipal: Principal = {
  userId: 'emp-id',
  role: 'Empleado',
  passwordChangeRequired: false,
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let branchAId: string
let branchBId: string
let branchCId: string
let empleadoId: string
let secretarioId: string

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "BranchAssignment", "Branch", "RefreshToken", "User", "AuditLog" RESTART IDENTITY CASCADE'
  )

  // Create two/three branches
  const bA = await prisma.branch.create({ data: { name: 'Branch A' } })
  branchAId = bA.id

  const bB = await prisma.branch.create({ data: { name: 'Branch B' } })
  branchBId = bB.id

  const bC = await prisma.branch.create({ data: { name: 'Branch C' } })
  branchCId = bC.id

  // Create an Empleado user for assignment
  const pw = await bcryptHash('password', 10)
  const emp = await prisma.user.create({
    data: {
      nombres: 'Test',
      apellidos: 'Employee',
      cedula: '111111',
      passwordHash: pw,
      role: 'Empleado',
      passwordChangeRequired: false,
    },
  })
  empleadoId = emp.id

  // Create a Secretario user (non-assignable target)
  const sec = await prisma.user.create({
    data: {
      nombres: 'Test',
      apellidos: 'Secretary',
      cedula: '222222',
      passwordHash: pw,
      role: 'Secretario',
      passwordChangeRequired: false,
    },
  })
  secretarioId = sec.id
})

// ---------------------------------------------------------------------------
// Assignment authz
// ---------------------------------------------------------------------------

describe('assignment — authorization', () => {
  it('G.2 — Empleado caller cannot assign → 403', async () => {
    await expect(
      assignEmployee(empPrincipal, branchAId, { userId: empleadoId })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('G.2 — Administrador can assign Empleado → 201', async () => {
    const assignment = await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    expect(assignment.id).toBeDefined()
    expect(assignment.branchId).toBe(branchAId)
    expect(assignment.userId).toBe(empleadoId)
    expect(assignment.unassignedAt).toBeNull()
    expect(assignment.assignedAt).toBeDefined()
  })

  it('G.2 — Secretario can assign Empleado → 201', async () => {
    const assignment = await assignEmployee(secPrincipal, branchAId, { userId: empleadoId })

    expect(assignment.branchId).toBe(branchAId)
    expect(assignment.userId).toBe(empleadoId)
  })
})

// ---------------------------------------------------------------------------
// Assignment domain validation
// ---------------------------------------------------------------------------

describe('assignment — domain validation', () => {
  it('G.2 — assigning non-Empleado target (Secretario) → 422 not_assignable_role', async () => {
    await expect(
      assignEmployee(adminPrincipal, branchAId, { userId: secretarioId })
    ).rejects.toMatchObject({ statusCode: 422, message: 'not_assignable_role' })
  })

  it('G.2 — assigning to non-existent branch → 404 branch_not_found', async () => {
    await expect(
      assignEmployee(adminPrincipal, 'nonexistent-branch', { userId: empleadoId })
    ).rejects.toMatchObject({ statusCode: 404, message: 'branch_not_found' })
  })

  it('G.2 — assigning non-existent user → 404 user_not_found', async () => {
    await expect(
      assignEmployee(adminPrincipal, branchAId, { userId: 'nonexistent-user' })
    ).rejects.toMatchObject({ statusCode: 404, message: 'user_not_found' })
  })
})

// ---------------------------------------------------------------------------
// Single-active invariant — reassign
// ---------------------------------------------------------------------------

describe('assignment — single-active invariant', () => {
  it('G.2 — first assignment creates exactly one active record', async () => {
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    const active = await prisma.branchAssignment.findMany({
      where: { userId: empleadoId, unassignedAt: null },
    })
    expect(active).toHaveLength(1)
    expect(active[0].branchId).toBe(branchAId)
  })

  it('G.2 — reassign closes prior active + opens new; history preserved', async () => {
    // Assign to A
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    // Wait a tiny bit so timestamps differ
    await new Promise(r => setTimeout(r, 5))

    // Reassign to B
    const newAssignment = await assignEmployee(adminPrincipal, branchBId, { userId: empleadoId })
    expect(newAssignment.branchId).toBe(branchBId)
    expect(newAssignment.unassignedAt).toBeNull()

    // Prior assignment (A) must be closed
    const all = await prisma.branchAssignment.findMany({
      where: { userId: empleadoId },
    })
    expect(all).toHaveLength(2)

    const closedA = all.find(a => a.branchId === branchAId)
    expect(closedA).toBeDefined()
    expect(closedA?.unassignedAt).not.toBeNull()
  })

  it('G.2 — after reassign, exactly one active assignment exists', async () => {
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })
    await new Promise(r => setTimeout(r, 5))
    await assignEmployee(adminPrincipal, branchBId, { userId: empleadoId })

    const active = await prisma.branchAssignment.findMany({
      where: { userId: empleadoId, unassignedAt: null },
    })
    expect(active).toHaveLength(1)
    expect(active[0].branchId).toBe(branchBId)
  })
})

// ---------------------------------------------------------------------------
// Assignment History — order and completeness
// ---------------------------------------------------------------------------

describe('assignment — history (getEmployeeBranch)', () => {
  it('G.2 — unassigned employee returns {branch:null, history:[]}', async () => {
    const view = await getEmployeeBranch(adminPrincipal, empleadoId)

    expect(view.branch).toBeNull()
    expect(view.history).toHaveLength(0)
  })

  it('G.2 — assigned employee returns current branch and history', async () => {
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    const view = await getEmployeeBranch(adminPrincipal, empleadoId)

    expect(view.branch).not.toBeNull()
    expect(view.branch?.id).toBe(branchAId)
    expect(view.history).toHaveLength(1)
  })

  it('G.2 — history contains both records after reassign (DESC order)', async () => {
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })
    await new Promise(r => setTimeout(r, 5))
    await assignEmployee(adminPrincipal, branchBId, { userId: empleadoId })

    const view = await getEmployeeBranch(adminPrincipal, empleadoId)

    expect(view.branch?.id).toBe(branchBId)
    expect(view.history).toHaveLength(2)
    // History is DESC — most recent (B) first
    expect(view.history[0].branchId).toBe(branchBId)
    expect(view.history[1].branchId).toBe(branchAId)
    // Closed assignment has unassignedAt set
    expect(view.history[1].unassignedAt).not.toBeNull()
  })

  it('G.2 — Empleado caller on getEmployeeBranch → 403', async () => {
    await expect(
      getEmployeeBranch(empPrincipal, empleadoId)
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

// ---------------------------------------------------------------------------
// AuditLog writes
// ---------------------------------------------------------------------------

describe('assignment — AuditLog writes (NFR-BR-6)', () => {
  it('G.2 — assignEmployee writes AuditLog row with action ASSIGN', async () => {
    const assignment = await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'BranchAssignment',
        entityId: assignment.id,
        action: 'ASSIGN',
      },
    })

    expect(audit).not.toBeNull()
    expect(audit?.entityType).toBe('BranchAssignment')
  })
})

// ---------------------------------------------------------------------------
// Branch soft-delete guard — blocked when active assignments exist
// ---------------------------------------------------------------------------

describe('branch soft-delete guard', () => {
  it('G.2 — soft-delete branch with active assignments → 409 branch_has_active_assignments', async () => {
    // Assign an employee to branchA
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    // Try to soft-delete branchA — should be blocked
    await expect(
      softDeleteBranch(adminPrincipal, branchAId)
    ).rejects.toMatchObject({ statusCode: 409, message: 'branch_has_active_assignments' })
  })

  it('G.2 — soft-delete allowed after reassigning employee away', async () => {
    // Assign to A, then reassign to B
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })
    await new Promise(r => setTimeout(r, 5))
    await assignEmployee(adminPrincipal, branchBId, { userId: empleadoId })

    // Now branchA has no active assignments — soft-delete should succeed
    await softDeleteBranch(adminPrincipal, branchAId)

    // branchA should be excluded from active list
    const branches = await listBranches(adminPrincipal)
    expect(branches.find(b => b.id === branchAId)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// G.2 — Concurrent reassign: single-active constraint via Promise.all
//
// This is the RED test deferred from PR1 (G.2 in tasks.md).
// Two concurrent assignEmployee calls race to assign the same employee
// to different branches simultaneously. Exactly one must succeed (200)
// and the other must fail with 409 assignment_conflict.
//
// The SERIALIZABLE transaction + partial unique index on "uniq_active_assignment_per_user"
// backstops this race: even if both requests enter the transaction simultaneously,
// the second commit will fail with P2002 (unique violation on the partial index)
// → caught in the repo → re-thrown as AssignmentConflictError
// → caught in the service → thrown as ServiceError(409).
// ---------------------------------------------------------------------------

describe('G.2 — concurrent reassign: single-active constraint', () => {
  it('concurrent assign attempts: exactly one succeeds, the other gets 409', async () => {
    // Pre-assign the employee to branchA so both concurrent calls are reassigns
    // (ensures the transaction must close an existing active row)
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    // Fire two concurrent reassign calls targeting different branches
    const results = await Promise.allSettled([
      assignEmployee(adminPrincipal, branchBId, { userId: empleadoId }),
      assignEmployee(adminPrincipal, branchCId, { userId: empleadoId }),
    ])

    const succeeded = results.filter(r => r.status === 'fulfilled')
    const failed = results.filter(r => r.status === 'rejected')

    // Exactly one must succeed
    expect(succeeded).toHaveLength(1)
    // Exactly one must fail with 409
    expect(failed).toHaveLength(1)
    const rejection = failed[0]
    if (rejection.status === 'rejected') {
      expect(rejection.reason).toMatchObject({ statusCode: 409 })
    }

    // The DB must have exactly one active assignment
    const activeRows = await prisma.branchAssignment.findMany({
      where: { userId: empleadoId, unassignedAt: null },
    })
    expect(activeRows).toHaveLength(1)
  })

  it('partial unique index is present in DB', async () => {
    // Direct raw SQL injection — proves the partial unique index is active
    // Assign once to create an active row
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    // Attempt to directly insert a second active row (bypasses transaction logic)
    // The DB partial unique index must reject this
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "BranchAssignment" (id, "branchId", "userId", "assignedAt", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, now(), now())`,
        branchBId,
        empleadoId
      )
    ).rejects.toThrow()

    // Only one active row should exist
    const active = await prisma.branchAssignment.findMany({
      where: { userId: empleadoId, unassignedAt: null },
    })
    expect(active).toHaveLength(1)
    expect(active[0].branchId).toBe(branchAId)
  })
})

// ---------------------------------------------------------------------------
// DTO safety — no internal fields (NFR-BR-8)
// ---------------------------------------------------------------------------

describe('assignment — DTO safety (NFR-BR-8)', () => {
  it('G.2 — assignment response does not include internal/Prisma fields', async () => {
    const assignment = await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    expect(assignment).toHaveProperty('id')
    expect(assignment).toHaveProperty('branchId')
    expect(assignment).toHaveProperty('userId')
    expect(assignment).toHaveProperty('assignedAt')
    expect(assignment).toHaveProperty('unassignedAt')
    // createdAt from the DB row must NOT leak through
    expect(JSON.stringify(assignment)).not.toContain('createdAt')
    expect(JSON.stringify(assignment)).not.toContain('passwordHash')
  })

  it('G.2 — getEmployeeBranch response does not include deletedAt or passwordHash', async () => {
    await assignEmployee(adminPrincipal, branchAId, { userId: empleadoId })

    const view = await getEmployeeBranch(adminPrincipal, empleadoId)

    expect(JSON.stringify(view)).not.toContain('deletedAt')
    expect(JSON.stringify(view)).not.toContain('passwordHash')
  })
})
