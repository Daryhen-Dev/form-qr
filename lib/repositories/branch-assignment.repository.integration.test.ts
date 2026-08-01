/**
 * Integration tests for branch-assignment.repository
 *
 * Tests the atomic reassign transaction and the single-active-branch constraint
 * enforced by the partial unique index "uniq_active_assignment_per_user".
 *
 * Requirements: form_qr_test DB must be running with migrations applied.
 * Run with: pnpm test --project integration
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { prisma } from '@/lib/db'
import {
  reassign,
  findActiveByUser,
  findHistoryByUser,
  findActiveByBranch,
  AssignmentConflictError,
} from './branch-assignment.repository'
import type { AssignmentRow } from './branch-assignment.repository'

// ---------------------------------------------------------------------------
// Test fixtures — created fresh before each test
// ---------------------------------------------------------------------------

let testUserId: string
let branchAId: string
let branchBId: string

beforeEach(async () => {
  // Truncate in FK-safe order
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "BranchAssignment", "Branch", "RefreshToken", "User", "AuditLog" RESTART IDENTITY CASCADE'
  )

  // Create a test user (Empleado — the only assignable role)
  const user = await prisma.user.create({
    data: {
      nombres: 'Test',
      apellidos: 'Employee',
      cedula: '123456',
      passwordHash: 'hash',
      role: 'Empleado',
      passwordChangeRequired: false,
    },
  })
  testUserId = user.id

  // Create two branches for reassignment tests
  const branchA = await prisma.branch.create({
    data: { name: 'Branch A' },
  })
  branchAId = branchA.id

  const branchB = await prisma.branch.create({
    data: { name: 'Branch B' },
  })
  branchBId = branchB.id
})

// ---------------------------------------------------------------------------
// findActiveByUser
// ---------------------------------------------------------------------------

describe('findActiveByUser', () => {
  it('returns null when the user has no active assignment', async () => {
    const result = await findActiveByUser(testUserId)
    expect(result).toBeNull()
  })

  it('returns the active assignment row', async () => {
    await reassign(testUserId, branchAId)
    const result = await findActiveByUser(testUserId)
    expect(result).not.toBeNull()
    expect(result!.branchId).toBe(branchAId)
    expect(result!.unassignedAt).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// findHistoryByUser
// ---------------------------------------------------------------------------

describe('findHistoryByUser', () => {
  it('returns empty array when no history exists', async () => {
    const history = await findHistoryByUser(testUserId)
    expect(history).toHaveLength(0)
  })

  it('returns all records ordered by assignedAt descending', async () => {
    await reassign(testUserId, branchAId)
    await new Promise(r => setTimeout(r, 10)) // tiny gap so timestamps differ
    await reassign(testUserId, branchBId)

    const history = await findHistoryByUser(testUserId)
    expect(history).toHaveLength(2)
    // Most recent (branchB) first
    expect(history[0].branchId).toBe(branchBId)
    expect(history[1].branchId).toBe(branchAId)
  })
})

// ---------------------------------------------------------------------------
// findActiveByBranch
// ---------------------------------------------------------------------------

describe('findActiveByBranch', () => {
  it('returns empty array when no active assignments for a branch', async () => {
    const result = await findActiveByBranch(branchAId)
    expect(result).toHaveLength(0)
  })

  it('returns only active assignments for the specified branch', async () => {
    await reassign(testUserId, branchAId)

    const resultA = await findActiveByBranch(branchAId)
    expect(resultA).toHaveLength(1)
    expect(resultA[0].userId).toBe(testUserId)

    const resultB = await findActiveByBranch(branchBId)
    expect(resultB).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// reassign — atomic transition
// ---------------------------------------------------------------------------

describe('reassign', () => {
  it('creates the first assignment (no prior active row)', async () => {
    const row: AssignmentRow = await reassign(testUserId, branchAId)

    expect(row.userId).toBe(testUserId)
    expect(row.branchId).toBe(branchAId)
    expect(row.unassignedAt).toBeNull()

    const active = await findActiveByUser(testUserId)
    expect(active).not.toBeNull()
    expect(active!.branchId).toBe(branchAId)
  })

  it('closes the prior active assignment when reassigning', async () => {
    // Assign to A
    await reassign(testUserId, branchAId)

    // Reassign to B
    const newRow = await reassign(testUserId, branchBId)
    expect(newRow.branchId).toBe(branchBId)
    expect(newRow.unassignedAt).toBeNull()

    // The A assignment must be closed
    const history = await findHistoryByUser(testUserId)
    expect(history).toHaveLength(2)

    const closedA = history.find(h => h.branchId === branchAId)
    expect(closedA).toBeDefined()
    expect(closedA!.unassignedAt).not.toBeNull()
  })

  it('leaves exactly one active assignment after a reassign', async () => {
    await reassign(testUserId, branchAId)
    await reassign(testUserId, branchBId)

    const allAssignments = await prisma.branchAssignment.findMany({
      where: { userId: testUserId },
    })

    const active = allAssignments.filter(a => a.unassignedAt === null)
    expect(active).toHaveLength(1)
    expect(active[0].branchId).toBe(branchBId)
  })

  it('preserves closed assignment rows in history (never deletes)', async () => {
    await reassign(testUserId, branchAId)
    await reassign(testUserId, branchBId)

    const all = await prisma.branchAssignment.findMany({
      where: { userId: testUserId },
    })
    expect(all).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Single-active constraint — concurrent reassign RED test
// Proves the partial unique index acts as a race backstop:
// The test uses raw SQL to force a state where two active rows would coexist,
// then verifies the DB constraint prevents it.
//
// NOTE: True Promise.all concurrency on a shared connection pool tends to
// serialize operations naturally. The partial unique index is the DB-level
// backstop that fires when two concurrent HTTP requests try to bypass the
// transaction (e.g., under genuine OS-level parallel I/O). Here we test
// the constraint directly via raw SQL injection to confirm it is active.
// ---------------------------------------------------------------------------

describe('reassign — single-active constraint (partial unique index)', () => {
  it('DB rejects a second active assignment for the same user via unique constraint', async () => {
    // Assign user to branchA (creates active row)
    await reassign(testUserId, branchAId)

    // Try to directly insert a second active row bypassing the transaction logic
    // This simulates what would happen if two concurrent requests both raced past
    // the updateMany step before either could commit
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "BranchAssignment" (id, "branchId", "userId", "assignedAt", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, now(), now())`,
        branchBId,
        testUserId
      )
    ).rejects.toThrow()

    // Only one active row should exist
    const activeRows = await prisma.branchAssignment.findMany({
      where: { userId: testUserId, unassignedAt: null },
    })
    expect(activeRows).toHaveLength(1)
    expect(activeRows[0].branchId).toBe(branchAId)
  })

  it('reassign leaves exactly one active assignment (sequential calls)', async () => {
    // Verify sequential reassigns are correct
    await reassign(testUserId, branchAId)
    await reassign(testUserId, branchBId)

    const activeRows = await prisma.branchAssignment.findMany({
      where: { userId: testUserId, unassignedAt: null },
    })
    expect(activeRows).toHaveLength(1)
    expect(activeRows[0].branchId).toBe(branchBId)
  })
})
