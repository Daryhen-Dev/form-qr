/**
 * Unit tests for assignment.service — authorization predicates, Empleado-only rule,
 * soft-delete block, and invariant handling.
 * All repositories are mocked.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/repositories/branch-assignment.repository', () => ({
  reassign: vi.fn(),
  findActiveByUser: vi.fn(),
  findHistoryByUser: vi.fn(),
  findActiveByBranch: vi.fn(),
  AssignmentConflictError: class AssignmentConflictError extends Error {
    constructor(message = 'active_assignment_conflict') {
      super(message)
      this.name = 'AssignmentConflictError'
    }
  },
}))
vi.mock('@/lib/repositories/branch.repository', () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
  countActiveAssignments: vi.fn(),
}))
vi.mock('@/lib/repositories/user.repository', () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByCedula: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
}))
vi.mock('@/lib/repositories/audit.repository', () => ({
  record: vi.fn(),
}))

import {
  reassign as repoReassign,
  findActiveByUser,
  findHistoryByUser,
  AssignmentConflictError,
} from '@/lib/repositories/branch-assignment.repository'
import { findById as findBranch } from '@/lib/repositories/branch.repository'
import { findById as findUser } from '@/lib/repositories/user.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { assignEmployee, getEmployeeBranch } from './assignment.service'
import type { Principal, Role } from '@/lib/types'

const mockReassign = vi.mocked(repoReassign)
const mockFindActiveByUser = vi.mocked(findActiveByUser)
const mockFindHistoryByUser = vi.mocked(findHistoryByUser)
const mockFindBranch = vi.mocked(findBranch)
const mockFindUser = vi.mocked(findUser)
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

function makeUser(role: Role, id = 'user_99') {
  return {
    id,
    nombres: 'Test',
    apellidos: 'User',
    cedula: '99887766',
    passwordHash: '$2a$12$hash',
    passwordChangeRequired: false,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }
}

const baseAssignment = {
  id: 'assign_01',
  branchId: 'branch_01',
  userId: 'user_99',
  assignedAt: new Date(),
  unassignedAt: null,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuditRecord.mockResolvedValue(undefined as never)
})

// ---------------------------------------------------------------------------
// assignEmployee — caller authorization
// ---------------------------------------------------------------------------

describe('assignment.service.assignEmployee — caller authorization', () => {
  it('Empleado caller → throws 403', async () => {
    await expect(
      assignEmployee(empleadoPrincipal, 'branch_01', { userId: 'user_01' })
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockFindBranch).not.toHaveBeenCalled()
  })

  it('Admin caller with valid Empleado target → succeeds', async () => {
    mockFindBranch.mockResolvedValueOnce(baseBranch)
    mockFindUser.mockResolvedValueOnce(makeUser('Empleado'))
    mockReassign.mockResolvedValueOnce(baseAssignment)

    const result = await assignEmployee(adminPrincipal, 'branch_01', { userId: 'user_99' })
    expect(result.branchId).toBe('branch_01')
    expect(mockAuditRecord).toHaveBeenCalledOnce()
  })

  it('Secretario caller with valid Empleado target → succeeds', async () => {
    mockFindBranch.mockResolvedValueOnce(baseBranch)
    mockFindUser.mockResolvedValueOnce(makeUser('Empleado'))
    mockReassign.mockResolvedValueOnce(baseAssignment)

    await expect(
      assignEmployee(secretarioPrincipal, 'branch_01', { userId: 'user_99' })
    ).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// assignEmployee — target role validation (Empleado-only rule)
// ---------------------------------------------------------------------------

describe('assignment.service.assignEmployee — Empleado-only rule', () => {
  it('Admin assigning Secretario target → throws 422 not_assignable_role', async () => {
    mockFindBranch.mockResolvedValueOnce(baseBranch)
    mockFindUser.mockResolvedValueOnce(makeUser('Secretario'))

    await expect(
      assignEmployee(adminPrincipal, 'branch_01', { userId: 'sec_user' })
    ).rejects.toMatchObject({ statusCode: 422, message: 'not_assignable_role' })
    expect(mockReassign).not.toHaveBeenCalled()
  })

  it('Admin assigning Administrador target → throws 422 not_assignable_role', async () => {
    mockFindBranch.mockResolvedValueOnce(baseBranch)
    mockFindUser.mockResolvedValueOnce(makeUser('Administrador'))

    await expect(
      assignEmployee(adminPrincipal, 'branch_01', { userId: 'admin_user' })
    ).rejects.toMatchObject({ statusCode: 422, message: 'not_assignable_role' })
    expect(mockReassign).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// assignEmployee — 404 handling
// ---------------------------------------------------------------------------

describe('assignment.service.assignEmployee — 404 handling', () => {
  it('throws 404 when branch not found', async () => {
    mockFindBranch.mockResolvedValueOnce(null)

    await expect(
      assignEmployee(adminPrincipal, 'nonexistent', { userId: 'user_99' })
    ).rejects.toMatchObject({ statusCode: 404, message: 'branch_not_found' })
    expect(mockFindUser).not.toHaveBeenCalled()
  })

  it('throws 404 when target user not found', async () => {
    mockFindBranch.mockResolvedValueOnce(baseBranch)
    mockFindUser.mockResolvedValueOnce(null)

    await expect(
      assignEmployee(adminPrincipal, 'branch_01', { userId: 'ghost_user' })
    ).rejects.toMatchObject({ statusCode: 404, message: 'user_not_found' })
    expect(mockReassign).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// assignEmployee — conflict / invariant handling
// ---------------------------------------------------------------------------

describe('assignment.service.assignEmployee — invariant handling', () => {
  it('reassign throws AssignmentConflictError → service returns 409 assignment_conflict', async () => {
    mockFindBranch.mockResolvedValueOnce(baseBranch)
    mockFindUser.mockResolvedValueOnce(makeUser('Empleado'))
    mockReassign.mockRejectedValueOnce(new AssignmentConflictError())

    await expect(
      assignEmployee(adminPrincipal, 'branch_01', { userId: 'user_99' })
    ).rejects.toMatchObject({ statusCode: 409, message: 'assignment_conflict' })
    expect(mockAuditRecord).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getEmployeeBranch — authorization and unassigned handling
// ---------------------------------------------------------------------------

describe('assignment.service.getEmployeeBranch', () => {
  it('Empleado caller → throws 403', async () => {
    await expect(
      getEmployeeBranch(empleadoPrincipal, 'some_user')
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockFindActiveByUser).not.toHaveBeenCalled()
  })

  it('unassigned employee → returns { branch: null, history: [] }', async () => {
    mockFindActiveByUser.mockResolvedValueOnce(null)
    mockFindHistoryByUser.mockResolvedValueOnce([])

    const result = await getEmployeeBranch(adminPrincipal, 'emp_01')
    expect(result.branch).toBeNull()
    expect(result.history).toHaveLength(0)
  })

  it('assigned employee → returns branch DTO and history', async () => {
    mockFindActiveByUser.mockResolvedValueOnce(baseAssignment)
    mockFindHistoryByUser.mockResolvedValueOnce([baseAssignment])
    mockFindBranch.mockResolvedValueOnce(baseBranch)

    const result = await getEmployeeBranch(adminPrincipal, 'user_99')
    expect(result.branch).not.toBeNull()
    expect(result.branch!.id).toBe(baseBranch.id)
    expect(result.history).toHaveLength(1)
  })

  it('Secretario CAN view employee branch', async () => {
    mockFindActiveByUser.mockResolvedValueOnce(null)
    mockFindHistoryByUser.mockResolvedValueOnce([])

    await expect(
      getEmployeeBranch(secretarioPrincipal, 'emp_01')
    ).resolves.not.toThrow()
  })
})
