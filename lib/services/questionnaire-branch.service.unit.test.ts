/**
 * Unit tests for questionnaire-branch.service — authorization predicates,
 * branch status checks, audit writes, and duplicate-assignment handling.
 * All repositories are mocked.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/repositories/questionnaire-branch.repository', () => ({
  assign: vi.fn(),
  remove: vi.fn(),
  findByQuestionnaire: vi.fn(),
  findByBranch: vi.fn(),
}))
vi.mock('@/lib/repositories/questionnaire.repository', () => ({
  findById: vi.fn(),
}))
vi.mock('@/lib/repositories/branch.repository', () => ({
  findById: vi.fn(),
  findByIdIncludingDeleted: vi.fn(),
}))
vi.mock('@/lib/repositories/audit.repository', () => ({
  record: vi.fn(),
}))

import {
  assign as repoAssign,
  remove as repoRemove,
  findByQuestionnaire,
  findByBranch,
} from '@/lib/repositories/questionnaire-branch.repository'
import { findById as findQuestionnaire } from '@/lib/repositories/questionnaire.repository'
import { findById as findBranch, findByIdIncludingDeleted as findBranchIncludingDeleted } from '@/lib/repositories/branch.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import {
  assignBranch,
  unassignBranch,
  listBranchesForTemplate,
  listTemplatesForBranch,
} from './questionnaire-branch.service'
import { ServiceError } from '@/lib/services/auth.service'
import type { Principal } from '@/lib/types'

const mockRepoAssign = vi.mocked(repoAssign)
const mockRepoRemove = vi.mocked(repoRemove)
const mockFindByQuestionnaire = vi.mocked(findByQuestionnaire)
const mockFindByBranch = vi.mocked(findByBranch)
const mockFindQuestionnaire = vi.mocked(findQuestionnaire)
const mockFindBranch = vi.mocked(findBranch)
const mockFindBranchIncludingDeleted = vi.mocked(findBranchIncludingDeleted)
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

const baseQuestionnaire = {
  id: 'q_01',
  title: 'Test Template',
  description: null,
  currentVersionId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const baseBranch = {
  id: 'b_01',
  name: 'Main Branch',
  code: null,
  address: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const baseAssignment = {
  id: 'qa_01',
  questionnaireId: 'q_01',
  branchId: 'b_01',
  assignedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuditRecord.mockResolvedValue(undefined as never)
})

// ---------------------------------------------------------------------------
// assignBranch — caller authorization
// ---------------------------------------------------------------------------

describe('questionnaire-branch.service.assignBranch — authorization', () => {
  it('Empleado caller → throws 403 before any repo call', async () => {
    await expect(
      assignBranch(empleadoPrincipal, 'q_01', 'b_01')
    ).rejects.toMatchObject({ statusCode: 403, message: 'insufficient_permissions' })
    expect(mockFindQuestionnaire).not.toHaveBeenCalled()
  })

  it('Administrador caller with valid questionnaire and active branch → succeeds with 201', async () => {
    mockFindQuestionnaire.mockResolvedValueOnce(baseQuestionnaire)
    mockFindBranch.mockResolvedValueOnce(baseBranch)
    mockRepoAssign.mockResolvedValueOnce(baseAssignment)

    const result = await assignBranch(adminPrincipal, 'q_01', 'b_01')
    expect(result.questionnaireId).toBe('q_01')
    expect(result.branchId).toBe('b_01')
    expect(mockAuditRecord).toHaveBeenCalledOnce()
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ASSIGN', entityType: 'QuestionnaireBranch' })
    )
  })

  it('Secretario caller with valid questionnaire and active branch → succeeds', async () => {
    mockFindQuestionnaire.mockResolvedValueOnce(baseQuestionnaire)
    mockFindBranch.mockResolvedValueOnce(baseBranch)
    mockRepoAssign.mockResolvedValueOnce(baseAssignment)

    await expect(
      assignBranch(secretarioPrincipal, 'q_01', 'b_01')
    ).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// assignBranch — questionnaire not found
// ---------------------------------------------------------------------------

describe('questionnaire-branch.service.assignBranch — questionnaire not found', () => {
  it('throws 404 questionnaire_not_found when questionnaire does not exist', async () => {
    mockFindQuestionnaire.mockResolvedValueOnce(null)

    await expect(
      assignBranch(adminPrincipal, 'nonexistent', 'b_01')
    ).rejects.toMatchObject({ statusCode: 404, message: 'questionnaire_not_found' })
    expect(mockFindBranch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// assignBranch — branch status checks (R5: inactive branch → 422)
// ---------------------------------------------------------------------------

describe('questionnaire-branch.service.assignBranch — branch status', () => {
  it('missing branch → throws 404 branch_not_found', async () => {
    mockFindQuestionnaire.mockResolvedValueOnce(baseQuestionnaire)
    mockFindBranch.mockResolvedValueOnce(null) // active-only lookup returns null
    mockFindBranchIncludingDeleted.mockResolvedValueOnce(null) // raw lookup also null → truly missing

    await expect(
      assignBranch(adminPrincipal, 'q_01', 'nonexistent')
    ).rejects.toMatchObject({ statusCode: 404, message: 'branch_not_found' })
    expect(mockRepoAssign).not.toHaveBeenCalled()
  })

  it('inactive (soft-deleted) branch → throws 422 branch_inactive', async () => {
    mockFindQuestionnaire.mockResolvedValueOnce(baseQuestionnaire)
    mockFindBranch.mockResolvedValueOnce(null) // active-only lookup returns null
    // raw lookup returns the branch (it exists but is soft-deleted)
    mockFindBranchIncludingDeleted.mockResolvedValueOnce({ ...baseBranch, deletedAt: new Date() })

    await expect(
      assignBranch(adminPrincipal, 'q_01', 'b_deleted')
    ).rejects.toMatchObject({ statusCode: 422, message: 'branch_inactive' })
    expect(mockRepoAssign).not.toHaveBeenCalled()
  })

  it('active branch → proceeds to assign', async () => {
    mockFindQuestionnaire.mockResolvedValueOnce(baseQuestionnaire)
    mockFindBranch.mockResolvedValueOnce(baseBranch) // found and active
    mockRepoAssign.mockResolvedValueOnce(baseAssignment)

    const result = await assignBranch(adminPrincipal, 'q_01', 'b_01')
    expect(result.id).toBe('qa_01')
  })
})

// ---------------------------------------------------------------------------
// assignBranch — audit log
// ---------------------------------------------------------------------------

describe('questionnaire-branch.service.assignBranch — audit', () => {
  it('calls auditRecord with ASSIGN action on success', async () => {
    mockFindQuestionnaire.mockResolvedValueOnce(baseQuestionnaire)
    mockFindBranch.mockResolvedValueOnce(baseBranch)
    mockRepoAssign.mockResolvedValueOnce(baseAssignment)

    await assignBranch(adminPrincipal, 'q_01', 'b_01')

    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ASSIGN',
        entityType: 'QuestionnaireBranch',
        entityId: 'qa_01',
        metadata: expect.objectContaining({
          assignedBy: 'admin_01',
          questionnaireId: 'q_01',
          branchId: 'b_01',
        }),
      })
    )
  })
})

// ---------------------------------------------------------------------------
// unassignBranch — authorization
// ---------------------------------------------------------------------------

describe('questionnaire-branch.service.unassignBranch — authorization', () => {
  it('Empleado caller → throws 403', async () => {
    await expect(
      unassignBranch(empleadoPrincipal, 'q_01', 'b_01')
    ).rejects.toMatchObject({ statusCode: 403, message: 'insufficient_permissions' })
    expect(mockRepoRemove).not.toHaveBeenCalled()
  })

  it('Administrador caller on existing assignment → succeeds', async () => {
    mockRepoRemove.mockResolvedValueOnce(undefined)

    await expect(
      unassignBranch(adminPrincipal, 'q_01', 'b_01')
    ).resolves.not.toThrow()
    expect(mockAuditRecord).toHaveBeenCalledOnce()
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UNASSIGN', entityType: 'QuestionnaireBranch' })
    )
  })
})

// ---------------------------------------------------------------------------
// unassignBranch — 404 if not assigned
// ---------------------------------------------------------------------------

describe('questionnaire-branch.service.unassignBranch — not found', () => {
  it('repoRemove throws 404 → service propagates 404', async () => {
    mockRepoRemove.mockRejectedValueOnce(new ServiceError(404, 'assignment_not_found'))

    await expect(
      unassignBranch(adminPrincipal, 'q_01', 'b_not_assigned')
    ).rejects.toMatchObject({ statusCode: 404, message: 'assignment_not_found' })
    expect(mockAuditRecord).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// listBranchesForTemplate — authorization
// ---------------------------------------------------------------------------

describe('questionnaire-branch.service.listBranchesForTemplate', () => {
  it('Empleado caller → throws 403', async () => {
    await expect(
      listBranchesForTemplate(empleadoPrincipal, 'q_01')
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('Administrador caller with valid questionnaire → returns assignments', async () => {
    mockFindQuestionnaire.mockResolvedValueOnce(baseQuestionnaire)
    mockFindByQuestionnaire.mockResolvedValueOnce([baseAssignment])

    const result = await listBranchesForTemplate(adminPrincipal, 'q_01')
    expect(result).toHaveLength(1)
    expect(result[0].branchId).toBe('b_01')
  })

  it('questionnaire not found → throws 404', async () => {
    mockFindQuestionnaire.mockResolvedValueOnce(null)

    await expect(
      listBranchesForTemplate(adminPrincipal, 'nonexistent')
    ).rejects.toMatchObject({ statusCode: 404, message: 'questionnaire_not_found' })
  })
})

// ---------------------------------------------------------------------------
// listTemplatesForBranch — authorization
// ---------------------------------------------------------------------------

describe('questionnaire-branch.service.listTemplatesForBranch', () => {
  it('Empleado caller → throws 403', async () => {
    await expect(
      listTemplatesForBranch(empleadoPrincipal, 'b_01')
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('Secretario caller → returns assignments', async () => {
    mockFindByBranch.mockResolvedValueOnce([baseAssignment])

    const result = await listTemplatesForBranch(secretarioPrincipal, 'b_01')
    expect(result).toHaveLength(1)
    expect(result[0].questionnaireId).toBe('q_01')
  })
})
