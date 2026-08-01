/**
 * Unit tests for branch.service — authorization predicates and invariant enforcement.
 * All repositories are mocked.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/repositories/branch.repository', () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
  countActiveAssignments: vi.fn(),
}))
vi.mock('@/lib/repositories/audit.repository', () => ({
  record: vi.fn(),
}))

import {
  create as repoCreate,
  findById,
  findAll,
  update as repoUpdate,
  softDelete as repoSoftDelete,
  countActiveAssignments,
} from '@/lib/repositories/branch.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import {
  createBranch,
  listBranches,
  getBranch,
  updateBranch,
  softDeleteBranch,
} from './branch.service'
import type { Principal } from '@/lib/types'

const mockRepoCreate = vi.mocked(repoCreate)
const mockFindById = vi.mocked(findById)
const mockFindAll = vi.mocked(findAll)
const mockRepoUpdate = vi.mocked(repoUpdate)
const mockSoftDelete = vi.mocked(repoSoftDelete)
const mockCountActiveAssignments = vi.mocked(countActiveAssignments)
const mockAuditRecord = vi.mocked(auditRecord)

// Helper principals
const adminPrincipal: Principal = {
  userId: 'admin_01',
  role: 'Administrador',
  passwordChangeRequired: false,
}
const secretarioPrincipal: Principal = {
  userId: 'sec_01',
  role: 'Secretario',
  passwordChangeRequired: false,
}
const empleadoPrincipal: Principal = {
  userId: 'emp_01',
  role: 'Empleado',
  passwordChangeRequired: false,
}

const baseBranch = {
  id: 'branch_01',
  name: 'Main Branch',
  code: null,
  address: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuditRecord.mockResolvedValue(undefined as never)
})

// ---------------------------------------------------------------------------
// createBranch — authorization
// ---------------------------------------------------------------------------

describe('branch.service.createBranch — authorization', () => {
  const createDto = { name: 'New Branch' }

  it('Admin CAN create a branch', async () => {
    mockRepoCreate.mockResolvedValueOnce(baseBranch)
    const result = await createBranch(adminPrincipal, createDto)
    expect(result.name).toBe('Main Branch')
    expect(mockRepoCreate).toHaveBeenCalledOnce()
    expect(mockAuditRecord).toHaveBeenCalledOnce()
  })

  it('Secretario CANNOT create a branch → throws 403', async () => {
    await expect(createBranch(secretarioPrincipal, createDto)).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockRepoCreate).not.toHaveBeenCalled()
  })

  it('Empleado CANNOT create a branch → throws 403', async () => {
    await expect(createBranch(empleadoPrincipal, createDto)).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockRepoCreate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// listBranches — authorization
// ---------------------------------------------------------------------------

describe('branch.service.listBranches — authorization', () => {
  it('Admin CAN list branches', async () => {
    mockFindAll.mockResolvedValueOnce([])
    await expect(listBranches(adminPrincipal)).resolves.not.toThrow()
  })

  it('Secretario CAN list branches', async () => {
    mockFindAll.mockResolvedValueOnce([])
    await expect(listBranches(secretarioPrincipal)).resolves.not.toThrow()
  })

  it('Empleado CANNOT list branches → throws 403', async () => {
    await expect(listBranches(empleadoPrincipal)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockFindAll).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getBranch — 404 handling
// ---------------------------------------------------------------------------

describe('branch.service.getBranch — 404 handling', () => {
  it('throws 404 when branch is not found', async () => {
    mockFindById.mockResolvedValueOnce(null)
    await expect(getBranch(adminPrincipal, 'nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('returns BranchDTO when branch is found', async () => {
    mockFindById.mockResolvedValueOnce(baseBranch)
    const result = await getBranch(adminPrincipal, baseBranch.id)
    expect(result.id).toBe(baseBranch.id)
  })
})

// ---------------------------------------------------------------------------
// updateBranch — authorization
// ---------------------------------------------------------------------------

describe('branch.service.updateBranch — authorization', () => {
  it('Admin CAN update a branch', async () => {
    mockFindById.mockResolvedValueOnce(baseBranch)
    mockRepoUpdate.mockResolvedValueOnce({ ...baseBranch, name: 'Updated' })
    const result = await updateBranch(adminPrincipal, baseBranch.id, { name: 'Updated' })
    expect(result.name).toBe('Updated')
    expect(mockAuditRecord).toHaveBeenCalledOnce()
  })

  it('Secretario CANNOT update a branch → throws 403', async () => {
    await expect(updateBranch(secretarioPrincipal, baseBranch.id, { name: 'Updated' })).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockRepoUpdate).not.toHaveBeenCalled()
  })

  it('Empleado CANNOT update a branch → throws 403', async () => {
    await expect(updateBranch(empleadoPrincipal, baseBranch.id, { name: 'Updated' })).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockRepoUpdate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// softDeleteBranch — 409 and authorization
// ---------------------------------------------------------------------------

describe('branch.service.softDeleteBranch — invariants', () => {
  it('Admin with active assignments → throws 409 branch_has_active_assignments', async () => {
    mockFindById.mockResolvedValueOnce(baseBranch)
    mockCountActiveAssignments.mockResolvedValueOnce(3)

    await expect(softDeleteBranch(adminPrincipal, baseBranch.id)).rejects.toMatchObject({
      statusCode: 409,
      message: 'branch_has_active_assignments',
    })
    expect(mockSoftDelete).not.toHaveBeenCalled()
    expect(mockAuditRecord).not.toHaveBeenCalled()
  })

  it('Admin with no active assignments → succeeds + audit called', async () => {
    mockFindById.mockResolvedValueOnce(baseBranch)
    mockCountActiveAssignments.mockResolvedValueOnce(0)
    mockSoftDelete.mockResolvedValueOnce({ ...baseBranch, deletedAt: new Date() })

    await expect(softDeleteBranch(adminPrincipal, baseBranch.id)).resolves.not.toThrow()
    expect(mockSoftDelete).toHaveBeenCalledWith(baseBranch.id)
    expect(mockAuditRecord).toHaveBeenCalledOnce()
  })

  it('Secretario CANNOT soft-delete → throws 403', async () => {
    await expect(softDeleteBranch(secretarioPrincipal, baseBranch.id)).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('Empleado CANNOT soft-delete → throws 403', async () => {
    await expect(softDeleteBranch(empleadoPrincipal, baseBranch.id)).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('throws 404 when branch does not exist', async () => {
    mockFindById.mockResolvedValueOnce(null)
    await expect(softDeleteBranch(adminPrincipal, 'nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(mockCountActiveAssignments).not.toHaveBeenCalled()
  })
})
