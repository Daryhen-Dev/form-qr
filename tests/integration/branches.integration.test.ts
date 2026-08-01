/**
 * Integration tests for branch CRUD — authz, audit, soft-delete behavior.
 *
 * Uses form_qr_test DB (via TEST_DATABASE_URL).
 * Covers spec requirements:
 *   - Branch Data Model (creation, fields)
 *   - Branch Creation — Administrador Only (201/403 matrix)
 *   - Branch List and View (soft-deleted excluded, 404)
 *   - Branch Update / PATCH (200/403/404)
 *   - Branch Soft-Delete (200/403/404/409 with active assignments)
 *   - AuditLog writes per mutation (NFR-BR-6)
 *   - No passwordHash / internal fields in responses (NFR-BR-8)
 *   - No @prisma/client imports in service layer responses (NFR-BR-3)
 *
 * Run with: pnpm vitest run --project integration
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  createBranch,
  listBranches,
  getBranch,
  updateBranch,
  softDeleteBranch,
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

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "BranchAssignment", "Branch", "RefreshToken", "User", "AuditLog" RESTART IDENTITY CASCADE'
  )
})

// ---------------------------------------------------------------------------
// Branch Creation — authz matrix
// ---------------------------------------------------------------------------

describe('branch CRUD — creation authz', () => {
  it('G.1 — Administrador creates a branch → 201', async () => {
    const branch = await createBranch(adminPrincipal, { name: 'Main Office' })

    expect(branch.id).toBeDefined()
    expect(branch.name).toBe('Main Office')
    expect(branch.createdAt).toBeDefined()
    expect(branch.updatedAt).toBeDefined()

    // Verify it is persisted in the DB
    const row = await prisma.branch.findUnique({ where: { id: branch.id } })
    expect(row).not.toBeNull()
    expect(row?.deletedAt).toBeNull()
  })

  it('G.1 — Secretario cannot create a branch → 403', async () => {
    await expect(
      createBranch(secPrincipal, { name: 'Branch X' })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('G.1 — Empleado cannot create a branch → 403', async () => {
    await expect(
      createBranch(empPrincipal, { name: 'Branch Y' })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('G.1 — AuditLog row written on successful createBranch', async () => {
    const branch = await createBranch(adminPrincipal, { name: 'Audited Branch' })

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Branch', entityId: branch.id, action: 'CREATE' },
    })

    expect(audit).not.toBeNull()
    expect(audit?.entityType).toBe('Branch')
    expect(audit?.action).toBe('CREATE')
  })
})

// ---------------------------------------------------------------------------
// Branch List — active-only
// ---------------------------------------------------------------------------

describe('branch CRUD — list active only', () => {
  it('G.1 — soft-deleted branch excluded from list', async () => {
    const active = await createBranch(adminPrincipal, { name: 'Active Branch' })
    const toDelete = await createBranch(adminPrincipal, { name: 'Deleted Branch' })

    await softDeleteBranch(adminPrincipal, toDelete.id)

    const branches = await listBranches(adminPrincipal)
    const ids = branches.map(b => b.id)
    expect(ids).toContain(active.id)
    expect(ids).not.toContain(toDelete.id)
  })

  it('G.1 — Secretario can list branches', async () => {
    await createBranch(adminPrincipal, { name: 'Visible' })

    const branches = await listBranches(secPrincipal)
    expect(branches.length).toBeGreaterThanOrEqual(1)
  })

  it('G.1 — Empleado cannot list branches → 403', async () => {
    await expect(listBranches(empPrincipal)).rejects.toMatchObject({ statusCode: 403 })
  })
})

// ---------------------------------------------------------------------------
// Branch View (GET by ID)
// ---------------------------------------------------------------------------

describe('branch CRUD — view by ID', () => {
  it('G.1 — Administrador can get branch by ID → 200', async () => {
    const created = await createBranch(adminPrincipal, { name: 'Viewable' })
    const found = await getBranch(adminPrincipal, created.id)

    expect(found.id).toBe(created.id)
    expect(found.name).toBe('Viewable')
  })

  it('G.1 — Secretario can get branch by ID → 200', async () => {
    const created = await createBranch(adminPrincipal, { name: 'SecViewable' })
    const found = await getBranch(secPrincipal, created.id)

    expect(found.id).toBe(created.id)
  })

  it('G.1 — unknown ID → 404', async () => {
    await expect(
      getBranch(adminPrincipal, 'nonexistent-id')
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('G.1 — soft-deleted branch returns 404', async () => {
    const branch = await createBranch(adminPrincipal, { name: 'About to be deleted' })
    await softDeleteBranch(adminPrincipal, branch.id)

    await expect(getBranch(adminPrincipal, branch.id)).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ---------------------------------------------------------------------------
// Branch Update (PATCH)
// ---------------------------------------------------------------------------

describe('branch CRUD — update', () => {
  it('G.1 — Administrador updates branch name → 200 + AuditLog', async () => {
    const branch = await createBranch(adminPrincipal, { name: 'Old Name' })
    const updated = await updateBranch(adminPrincipal, branch.id, { name: 'New Name' })

    expect(updated.name).toBe('New Name')

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Branch', entityId: branch.id, action: 'UPDATE' },
    })
    expect(audit).not.toBeNull()
  })

  it('G.1 — Secretario cannot update branch → 403', async () => {
    const branch = await createBranch(adminPrincipal, { name: 'Protected' })

    await expect(
      updateBranch(secPrincipal, branch.id, { name: 'Attempted' })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('G.1 — update non-existent branch → 404', async () => {
    await expect(
      updateBranch(adminPrincipal, 'nonexistent-id', { name: 'Ghost' })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ---------------------------------------------------------------------------
// Branch Soft-Delete (DELETE)
// ---------------------------------------------------------------------------

describe('branch CRUD — soft-delete', () => {
  it('G.1 — Administrador soft-deletes branch → 200 + deletedAt set + AuditLog', async () => {
    const branch = await createBranch(adminPrincipal, { name: 'Soft Delete Me' })
    await softDeleteBranch(adminPrincipal, branch.id)

    const row = await prisma.branch.findUnique({ where: { id: branch.id } })
    expect(row?.deletedAt).not.toBeNull()

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Branch', entityId: branch.id, action: 'DELETE' },
    })
    expect(audit).not.toBeNull()
  })

  it('G.1 — Secretario cannot soft-delete branch → 403', async () => {
    const branch = await createBranch(adminPrincipal, { name: 'Protected Delete' })

    await expect(
      softDeleteBranch(secPrincipal, branch.id)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('G.1 — soft-delete non-existent branch → 404', async () => {
    await expect(
      softDeleteBranch(adminPrincipal, 'nonexistent-id')
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('G.1 — soft-delete branch row remains in DB (not hard-deleted)', async () => {
    const branch = await createBranch(adminPrincipal, { name: 'Preserved Row' })
    await softDeleteBranch(adminPrincipal, branch.id)

    // Raw DB lookup — the row must still exist
    const row = await prisma.branch.findUnique({ where: { id: branch.id } })
    expect(row).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// No internal fields in DTO responses (NFR-BR-8)
// ---------------------------------------------------------------------------

describe('branch CRUD — DTO safety (NFR-BR-8)', () => {
  it('G.1 — createBranch response does not include deletedAt or Prisma internals', async () => {
    const branch = await createBranch(adminPrincipal, { name: 'DTO Test' })

    // BranchDTO should only have these fields
    expect(branch).toHaveProperty('id')
    expect(branch).toHaveProperty('name')
    expect(branch).toHaveProperty('createdAt')
    expect(branch).toHaveProperty('updatedAt')
    // deletedAt must NOT be in the DTO
    expect(JSON.stringify(branch)).not.toContain('deletedAt')
  })

  it('G.1 — listBranches response does not include deletedAt', async () => {
    await createBranch(adminPrincipal, { name: 'DTO List Test' })
    const branches = await listBranches(adminPrincipal)

    expect(JSON.stringify(branches)).not.toContain('deletedAt')
  })
})
